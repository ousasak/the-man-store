/**
 * Helper to resolve static/uploaded image URLs and fallback placeholders
 */
export function getImageUrl(path, fallback = '/placeholder-product.png') {
  if (!path) return fallback;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
}
