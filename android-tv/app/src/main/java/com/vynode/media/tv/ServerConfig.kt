package com.vynode.media.tv

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class ServerConfig(val url: String = "", val token: String = "", val allowLocalHttp: Boolean = false, val serverId: String = "", val serverName: String = "")

class ServerConfigStore(context: Context) {
    private val prefs = context.getSharedPreferences("vynode_tv", Context.MODE_PRIVATE)
    private val alias = "vynode-tv-token"

    fun load() = ServerConfig(prefs.getString("server_url", "") ?: "", decrypt(prefs.getString("token", "") ?: ""), prefs.getBoolean("allow_http", false), prefs.getString("server_id", "") ?: "", prefs.getString("server_name", "") ?: "")
    fun save(config: ServerConfig) = prefs.edit().putString("server_url", normalize(config.url)).putString("token", encrypt(config.token)).putBoolean("allow_http", config.allowLocalHttp).putString("server_id", config.serverId).putString("server_name", config.serverName).apply()
    fun accountToken() = decrypt(prefs.getString("account_token", "") ?: "")
    fun saveAccountToken(token: String) { prefs.edit().putString("account_token", encrypt(token)).commit() }
    fun clearServer() = prefs.edit().remove("server_url").remove("token").remove("allow_http").remove("server_id").remove("server_name").apply()
    fun clear() = prefs.edit().clear().apply()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun encrypt(value: String): String {
        if (value.isBlank()) return ""
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8)), Base64.NO_WRAP)
    }
    private fun decrypt(value: String): String = try {
        if (value.isBlank()) "" else Base64.decode(value, Base64.NO_WRAP).let { bytes ->
            val iv = bytes.copyOfRange(0, 12)
            val encrypted = bytes.copyOfRange(12, bytes.size)
            String(Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }.doFinal(encrypted), StandardCharsets.UTF_8)
        }
    } catch (_: Exception) { "" }

    companion object {
        fun normalize(value: String) = value.trim().trimEnd('/')
        fun validate(url: String, allowHttp: Boolean): String? = try {
            val uri = java.net.URI(normalize(url))
            when {
                uri.host.isNullOrBlank() -> "Enter a complete server address."
                uri.scheme == "https" -> null
                uri.scheme == "http" && allowHttp && isPrivateHost(uri.host) -> null
                uri.scheme == "http" -> "HTTP is allowed only for an explicitly trusted private-network server."
                else -> "The server address must use HTTPS."
            }
        } catch (_: Exception) { "Enter a valid server address." }

        fun isPrivateHost(host: String): Boolean = host == "localhost" || host.endsWith(".local") || host.matches(Regex("^10\\..+")) || host.matches(Regex("^192\\.168\\..+")) || host.matches(Regex("^172\\.(1[6-9]|2\\d|3[01])\\..+"))
    }
}
