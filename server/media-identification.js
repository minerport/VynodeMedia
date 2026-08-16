import path from "node:path";
const patterns = [/(?:^|[ ._-])s(\d{1,2})e(\d{1,3})(?:[ ._-]|$)/i, /(?:^|[ ._-])(\d{1,2})x(\d{1,3})(?:[ ._-]|$)/i];
export function identifyMedia(file, root, configuredType = "auto") {
  const relative = path.relative(root, file), parts = relative.split(path.sep);
  const episode = patterns.map((pattern) => relative.match(pattern)).find(Boolean);
  const seasonFolder = relative.match(/(?:^|[\\/])season[ ._-]*(\d{1,2})(?:[\\/]|$)/i);
  const tvFolder = parts.findIndex((part) => /^(tv|tv shows?|shows?|series)$/i.test(part));
  const type = episode || seasonFolder || tvFolder >= 0 ? "tv" : "movie";
  const year = (relative.match(/\b(?:19|20)\d{2}\b/) || [""])[0];
  let showPart = tvFolder >= 0 ? parts[tvFolder + 1] : parts[0];
  return { type, year, season: Number(episode?.[1] || seasonFolder?.[1] || 1), episode: Number(episode?.[2] || 0), showPart: showPart || path.basename(file), matchesLibrary: configuredType === "auto" || configuredType === "movies" && type === "movie" || configuredType === "tv" && type === "tv" };
}
