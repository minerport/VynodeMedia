package com.vynode.media.tv

import org.json.JSONObject

data class Episode(val id: String, val title: String, val season: Int, val episode: Int, val progress: Float, val duration: Long = 0)
data class Season(val number: Int, val title: String, val episodes: List<Episode>)
data class MediaTitle(
    val id: String,
    val title: String,
    val year: String,
    val kind: String,
    val libraryName: String,
    val progress: Float,
    val hue: Int,
    val description: String = "",
    val rating: String = "",
    val artwork: String = "",
    val backdrop: String = "",
    val seasons: List<Season> = emptyList(),
)

object LibraryParser {
    fun parse(json: String): List<MediaTitle> {
        val items = JSONObject(json).optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).map { index ->
            val item = items.getJSONObject(index)
            val seasonsJson = item.optJSONArray("seasons")
            val seasons = if (seasonsJson == null) emptyList() else (0 until seasonsJson.length()).map { s ->
                val season = seasonsJson.getJSONObject(s)
                val episodesJson = season.optJSONArray("episodes")
                val episodes = if (episodesJson == null) emptyList() else (0 until episodesJson.length()).map { e ->
                    val episode = episodesJson.getJSONObject(e)
                    Episode(episode.getString("id"), episode.optString("title", "Episode ${e + 1}"), episode.optInt("season", season.optInt("number", 1)), episode.optInt("episode", e + 1), episode.optDouble("progress", 0.0).toFloat(), (episode.optDouble("duration", 0.0) * 1000).toLong())
                }
                Season(season.optInt("number", s + 1), season.optString("title", "Season ${s + 1}"), episodes)
            }
            MediaTitle(
                id = item.getString("id"),
                title = item.optString("title", "Untitled"),
                year = item.optString("year"),
                kind = item.optString("kind", "Movie"),
                libraryName = item.optString("libraryName", "Library"),
                progress = item.optDouble("progress", 0.0).toFloat(),
                hue = item.optInt("hue", (index * 47 + 215) % 360),
                description = item.optString("description"),
                rating = item.optString("rating"),
                artwork = item.optString("artwork", item.optString("poster")),
                backdrop = item.optString("backdrop"),
                seasons = seasons,
            )
        }
    }
}
