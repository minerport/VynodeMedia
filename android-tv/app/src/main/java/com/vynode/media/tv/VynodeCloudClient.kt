package com.vynode.media.tv

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class CloudServer(val id: String, val name: String, val endpoints: List<String>, val online: Boolean)

class VynodeCloudClient(private val accountToken: String = "") {
    fun login(email: String, password: String): String {
        val result = JSONObject(request("/v1/accounts/login", "POST", JSONObject().put("email", email.trim()).put("password", password).toString()))
        return result.getString("token")
    }
    fun register(name: String, email: String, password: String): String {
        val body = JSONObject().put("name", name.trim()).put("email", email.trim()).put("password", password).toString()
        return JSONObject(request("/v1/accounts/register", "POST", body)).getString("token")
    }
    fun servers(): List<CloudServer> {
        val values = JSONObject(request("/v1/servers")).optJSONArray("servers") ?: return emptyList()
        return (0 until values.length()).map { index ->
            val value = values.getJSONObject(index)
            val endpoints = value.optJSONArray("endpoints")
            CloudServer(value.getString("id"), value.optString("name", "Vynode Server"), if (endpoints == null) emptyList() else (0 until endpoints.length()).map { endpoints.getString(it) }, value.optBoolean("online"))
        }
    }
    fun accessTicket(serverId: String): String = JSONObject(request("/v1/servers/$serverId/access", "POST", "{}")).getString("ticket")
    fun logout() { request("/v1/session", "DELETE") }

    private fun request(path: String, method: String = "GET", body: String? = null): String {
        val connection = URL("https://media.vynodehub.com$path").openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = 12_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", "application/json")
        if (accountToken.isNotBlank()) connection.setRequestProperty("Authorization", "Bearer $accountToken")
        if (body != null) { connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.bufferedWriter().use { it.write(body) } }
        val code = connection.responseCode
        val text = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (code !in 200..299) throw IllegalStateException(JSONObject(text.ifBlank { "{}" }).optString("error", "Cloud returned HTTP $code"))
        return text
    }
}
