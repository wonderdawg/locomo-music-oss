import AVFoundation
import AudioToolbox
import Foundation

struct Request: Decodable {
    let inputPath: String
    let outputPath: String
}

struct Response: Encodable {
    let bitRate: Int
    let channels: Int
    let codec: String
    let container: String
    let durationSeconds: Double
    let fileSize: Int64
    let outputPath: String
    let sampleRate: Double
}

enum EncoderError: LocalizedError {
    case incompatibleInput
    case invalidArguments
    case invalidOutput(String)
    case exportFailed(String)

    var errorDescription: String? {
        switch self {
        case .incompatibleInput:
            return "AVFoundation cannot export this WAV as Apple M4A."
        case .invalidArguments:
            return "Expected one JSON AAC request on standard input."
        case .invalidOutput(let detail):
            return "AAC verification failed: \(detail)"
        case .exportFailed(let detail):
            return "AVFoundation export failed: \(detail)"
        }
    }
}

func inspectM4A(_ url: URL) async throws -> Response {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard
        let size = attributes[.size] as? NSNumber,
        size.int64Value > 0
    else {
        throw EncoderError.invalidOutput("the M4A is empty")
    }

    let header = try Data(contentsOf: url, options: .mappedIfSafe).prefix(64)
    guard
        header.count >= 12,
        String(data: header[4..<8], encoding: .ascii) == "ftyp",
        String(data: header[8..<12], encoding: .ascii) == "M4A "
    else {
        throw EncoderError.invalidOutput("the file is not an M4A container")
    }

    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration)
    let tracks = try await asset.loadTracks(withMediaType: .audio)
    guard tracks.count == 1, let track = tracks.first else {
        throw EncoderError.invalidOutput("expected exactly one audio track")
    }
    let descriptions = try await track.load(.formatDescriptions)
    guard
        let description = descriptions.first,
        let basic = CMAudioFormatDescriptionGetStreamBasicDescription(
            description
        )?.pointee,
        basic.mFormatID == kAudioFormatMPEG4AAC
    else {
        throw EncoderError.invalidOutput("the audio codec is not AAC")
    }
    let bitRate = Int(try await track.load(.estimatedDataRate).rounded())
    let seconds = CMTimeGetSeconds(duration)
    guard
        bitRate > 0,
        basic.mChannelsPerFrame > 0,
        basic.mSampleRate > 0,
        seconds.isFinite,
        seconds > 0
    else {
        throw EncoderError.invalidOutput("the audio metadata is incomplete")
    }

    return Response(
        bitRate: bitRate,
        channels: Int(basic.mChannelsPerFrame),
        codec: "aac",
        container: "m4a",
        durationSeconds: seconds,
        fileSize: size.int64Value,
        outputPath: url.path,
        sampleRate: basic.mSampleRate
    )
}

func respond(_ response: Response) throws {
    let data = try JSONEncoder().encode(response)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

func run() async throws {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    guard !input.isEmpty else {
        throw EncoderError.invalidArguments
    }
    let request = try JSONDecoder().decode(Request.self, from: input)
    let sourceURL = URL(fileURLWithPath: request.inputPath).standardizedFileURL
    let outputURL = URL(fileURLWithPath: request.outputPath).standardizedFileURL
    let fileManager = FileManager.default

    guard outputURL.pathExtension.lowercased() == "m4a" else {
        throw EncoderError.invalidArguments
    }
    if fileManager.fileExists(atPath: outputURL.path) {
        try await respond(inspectM4A(outputURL))
        return
    }

    try fileManager.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    let asset = AVURLAsset(url: sourceURL)
    guard let exporter = AVAssetExportSession(
        asset: asset,
        presetName: AVAssetExportPresetAppleM4A
    ) else {
        throw EncoderError.incompatibleInput
    }

    do {
        try await exporter.export(to: outputURL, as: .m4a)
    } catch {
        throw EncoderError.exportFailed(error.localizedDescription)
    }
    try await respond(inspectM4A(outputURL))
}

@main
struct LocomoAacEncoder {
    static func main() async {
        do {
            try await run()
        } catch {
            let message =
                (error as? LocalizedError)?.errorDescription
                ?? String(describing: error)
            FileHandle.standardError.write(Data("\(message)\n".utf8))
            exit(1)
        }
    }
}
