package com.vynode.media.tv

import org.junit.Assert.*
import org.junit.Test

class LibraryParserTest {
    @Test fun parsesSeriesHierarchy() {
        val titles = LibraryParser.parse("""{"items":[{"id":"show","title":"Orbit","kind":"Series","seasons":[{"number":1,"episodes":[{"id":"ep","title":"Pilot","season":1,"episode":1}]}]}]}""")
        assertEquals("Orbit", titles.single().title)
        assertEquals("Pilot", titles.single().seasons.single().episodes.single().title)
    }
}
