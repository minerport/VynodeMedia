package com.vynode.media.tv

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class VynodeClient(private val config: ServerConfig) {
    fun library(): List<MediaTitle> = LibraryParser.parse(request("/api/library"))
    fun trailers(): Map<String, String> {
        val values = JSONObject(request("/api/customization")).optJSONObject("trailers") ?: return emptyMap()
        return values.keys().asSequence().associateWith { values.optString(it) }.filterValues { it.isNotBlank() }
    }
    fun watchlist(): Set<String> {
        val values = JSONObject(request("/api/watchlist")).optJSONArray("watchlist") ?: return emptySet()
        return (0 until values.length()).map { values.optString(it) }.filter { it.isNotBlank() }.toSet()
    }
    fun setWatchlisted(id: String, enabled: Boolean) { request("/api/watchlist/$id", if (enabled) "POST" else "DELETE") }
    fun claim(code: String): String {
        val body = JSONObject().put("code", code.uppercase()).put("name", "NVIDIA Shield TV").toString()
        return JSONObject(request("/api/pair/claim", "POST", body)).getString("token")
    }
    fun claimCloud(ticket: String): String {
        val body = JSONObject().put("ticket", ticket).put("name", "NVIDIA Shield TV").toString()
        return JSONObject(request("/api/cloud/claim", "POST", body)).getString("token")
    }
    fun progress(id: String, value: Float) { request("/api/progress/$id", "POST", JSONObject().put("progress", value).toString()) }
    fun streamUrl(id: String, transcode: Boolean = false) = "${config.url}/${if (transcode) "transcode" else "stream"}/$id"

    private fun request(path: String, method: String = "GET", body: String? = null): String {
        ServerConfigStore.validate(config.url, config.allowLocalHttp)?.let { throw IllegalArgumentException(it) }
        val connection = URL(config.url + path).openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("Accept", "application/json")
        if (config.token.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer ${config.token}")
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.bufferedWriter().use { it.write(body) }
        }
        val code = connection.responseCode
        val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (code !in 200..299) throw IllegalStateException(JSONObject(text.ifBlank { "{}" }).optString("error", "Server returned HTTP $code"))
        return text
    }
}
