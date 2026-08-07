import type { MusicGenerationRequest } from "../shared/app-contract";
import {
  EXISTING_BOLLYWOOD_HOUSE_CATEGORY_KEY,
  EXISTING_LATIN_HOUSE_CATEGORY_KEY,
  EXISTING_LATIN_TECHNO_CATEGORY_KEY,
  EXISTING_LATIN_TRAP_CATEGORY_KEY,
} from "../shared/music-categories";

export function resolveMusicVocalLanguage(
  input: Pick<MusicGenerationRequest, "categoryKey" | "lyrics">,
) {
  if (
    input.lyrics.trim().length === 0 ||
    input.lyrics.trim() === "[Instrumental]"
  ) {
    return "en";
  }
  if (
    input.categoryKey === EXISTING_LATIN_HOUSE_CATEGORY_KEY ||
    input.categoryKey === EXISTING_LATIN_TECHNO_CATEGORY_KEY ||
    input.categoryKey === EXISTING_LATIN_TRAP_CATEGORY_KEY
  ) {
    return "es";
  }
  if (input.categoryKey === EXISTING_BOLLYWOOD_HOUSE_CATEGORY_KEY) {
    return "hi";
  }
  return "en";
}
