package com.vynode.media.tv

import org.junit.Assert.*
import org.junit.Test

class ServerConfigTest {
    @Test fun httpsIsAccepted() = assertNull(ServerConfigStore.validate("https://media.example.com", false))
    @Test fun publicHttpIsRejected() = assertNotNull(ServerConfigStore.validate("http://example.com", true))
    @Test fun localHttpRequiresConsent() {
        assertNotNull(ServerConfigStore.validate("http://192.168.1.20:8787", false))
        assertNull(ServerConfigStore.validate("http://192.168.1.20:8787", true))
    }
    @Test fun normalizesTrailingSlash() = assertEquals("https://example.com", ServerConfigStore.normalize(" https://example.com/ "))
}
