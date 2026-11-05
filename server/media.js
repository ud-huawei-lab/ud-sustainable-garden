export const mediaPath = (path) =>
  /^(?:segment\/)?[\w.-]+\.(?:m3u8|ts|m4s|mp4)$/.test(path) &&
  !path.includes("..");
export function rewritePlaylist(text, base, cameraId) {
  const rewrite = (uri) => {
    const target = new URL(uri, base);
    if (
      target.origin !== base.origin ||
      !target.pathname.startsWith(base.pathname)
    )
      throw new Error("Unsupported playlist resource.");
    const relative = target.pathname.slice(base.pathname.length);
    if (!mediaPath(relative)) throw new Error("Unsupported media path.");
    return `/api/video/${cameraId}/${relative}`;
  };
  return text
    .split("\n")
    .map((line) =>
      line.startsWith("#")
        ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewrite(uri)}"`)
        : line.trim()
          ? rewrite(line.trim())
          : line,
    )
    .join("\n");
}
