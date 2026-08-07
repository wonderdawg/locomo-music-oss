#!/bin/sh
set -eu

if [ "$#" -ne 0 ]; then
  echo "usage: scripts/build-cpp-q8-helper.sh" >&2
  exit 2
fi

for required_command in cmake git xcrun codesign otool shasum
do
  if ! command -v "$required_command" >/dev/null 2>&1
  then
    echo "$required_command is required to build the native helper" >&2
    exit 1
  fi
done

project_root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
output_directory=$project_root/resources/runtime-cpp-q8/bin
source_revision=fa337757a0a0d4a576d129bb45dbef00ceced73c
ggml_revision=c044c6f03892f9d5e98213b05f8afea1f8b0d3c9
build_root=$(mktemp -d "${TMPDIR:-/tmp}/locomo-cpp-q8-build.XXXXXX")
source_root=$build_root/acestep.cpp
build_directory=$build_root/build
mapped_compile_flags="-ffile-prefix-map=$build_root=. -fdebug-prefix-map=$build_root=. -fmacro-prefix-map=$build_root=."

cleanup() {
  rm -rf "$build_root"
}
trap cleanup EXIT HUP INT TERM

git clone --filter=blob:none \
  https://github.com/ServeurpersoCom/acestep.cpp.git \
  "$source_root"
git -C "$source_root" checkout --detach "$source_revision"
git -C "$source_root" submodule update --init --recursive

test "$(git -C "$source_root" rev-parse HEAD)" = "$source_revision"
test "$(git -C "$source_root/ggml" rev-parse HEAD)" = "$ggml_revision"

git -C "$source_root" apply \
  "$project_root/resources/runtime-cpp-q8/BUILD_COMPATIBILITY_PATCH.diff"

cmake -S "$source_root" -B "$build_directory" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 \
  -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON \
  -DCMAKE_BUILD_WITH_INSTALL_RPATH=ON \
  -DCMAKE_INSTALL_RPATH=@loader_path \
  -DCMAKE_C_FLAGS="$mapped_compile_flags" \
  -DCMAKE_CXX_FLAGS="$mapped_compile_flags" \
  -DGGML_NATIVE=OFF \
  -DGGML_METAL=ON \
  -DGGML_ACCELERATE=ON \
  -DGGML_BLAS=ON \
  -DGGML_BLAS_VENDOR=Apple
cmake --build "$build_directory" --config Release --target ace-server -j

mkdir -p "$output_directory"
cp "$build_directory/ace-server" "$output_directory/ace-server"
for library in \
  libggml-base.0.17.0.dylib \
  libggml-blas.0.17.0.dylib \
  libggml-cpu.0.17.0.dylib \
  libggml-metal.0.17.0.dylib \
  libggml.0.17.0.dylib
do
  cp "$build_directory/$library" "$output_directory/$library"
done

for native_file in "$output_directory"/*
do
  xcrun strip -S -x "$native_file"
  if otool -l "$native_file" | grep -F "path $build_directory " >/dev/null 2>&1
  then
    xcrun install_name_tool -delete_rpath "$build_directory" "$native_file"
  fi
  if ! otool -l "$native_file" | grep -F "path @loader_path " >/dev/null 2>&1
  then
    xcrun install_name_tool -add_rpath @loader_path "$native_file"
  fi
  for library in libggml-base libggml-blas libggml-cpu libggml-metal libggml
  do
    if otool -L "$native_file" | grep -F "@rpath/$library.0.dylib" >/dev/null 2>&1
    then
      xcrun install_name_tool \
        -change "@rpath/$library.0.dylib" \
        "@rpath/$library.0.17.0.dylib" \
        "$native_file"
    fi
  done
  case "$(basename "$native_file")" in
    libggml*.0.17.0.dylib)
      library_id=$(basename "$native_file")
      xcrun install_name_tool -id "@rpath/$library_id" "$native_file"
      ;;
  esac
  # Community builds use ordinary ad-hoc signatures for locally built helpers.
  codesign --force --sign - "$native_file"
  chmod 755 "$native_file"
  if strings -a "$native_file" | grep -E '/Users/|/Volumes/|/private/(tmp|var)/|/opt/homebrew/' >/dev/null 2>&1
  then
    echo "native build contains a developer-machine absolute path: $native_file" >&2
    exit 1
  fi
done

file "$output_directory/ace-server"
otool -L "$output_directory/ace-server"
shasum -a 256 "$output_directory"/*
