import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { identifyMedia } from "./media-identification.js";
const root = path.resolve("X:/Media");
test("recognizes SxxExx television", () => { const x = identifyMedia(path.join(root,"Shows","Foundation","Season 02","Foundation.S02E03.mkv"),root); assert.deepEqual([x.type,x.season,x.episode,x.showPart],["tv",2,3,"Foundation"]); });
test("recognizes 1x02 television", () => { const x=identifyMedia(path.join(root,"Firefly","Firefly 1x02.mkv"),root); assert.deepEqual([x.type,x.season,x.episode],["tv",1,2]); });
test("keeps nested films as movies", () => assert.equal(identifyMedia(path.join(root,"Dune (2021)","Dune.2021.mkv"),root).type,"movie"));
test("rejects a movie from an explicit TV library", () => assert.equal(identifyMedia(path.join(root,"Dune (2021)","Dune.2021.mkv"),root,"tv").matchesLibrary,false));
test("rejects an episode from an explicit movie library", () => assert.equal(identifyMedia(path.join(root,"Foundation","Foundation.S02E03.mkv"),root,"movies").matchesLibrary,false));
test("accepts matching explicit library types", () => {
  assert.equal(identifyMedia(path.join(root,"Dune.2021.mkv"),root,"movies").matchesLibrary,true);
  assert.equal(identifyMedia(path.join(root,"Foundation.S02E03.mkv"),root,"tv").matchesLibrary,true);
});
