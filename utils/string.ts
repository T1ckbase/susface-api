export function parseResolution(resolutionString?: string) {
  if (!resolutionString) return { width: undefined, height: undefined };
  const parts = resolutionString.split('x');
  if (parts.length === 2) {
    const width = parseInt(parts[0], 10);
    const height = parseInt(parts[1], 10);
    return { width, height };
  } else {
    return { width: undefined, height: undefined };
  }
}
