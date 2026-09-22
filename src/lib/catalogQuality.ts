import { isDistributorCategory } from './distributorAccess';
import { isCreditCategory } from './creditAccess';

export function supportsHighQuality(category?: string | null) {
  return isDistributorCategory(undefined, category) || isCreditCategory(undefined, category);
}

export function usesHighQuality(document?: { category?: string; highQuality?: boolean } | null) {
  return document?.highQuality === true && supportsHighQuality(document.category);
}
