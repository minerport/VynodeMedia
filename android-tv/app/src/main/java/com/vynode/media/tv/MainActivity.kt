package com.vynode.media.tv

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import androidx.compose.ui.viewinterop.AndroidView
import androidx.tv.material3.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val Ink = Color(0xFF080A0F)
private val Panel = Color(0xFF11141C)
private val Purple = Color(0xFF7C5CFF)
private val Teal = Color(0xFF45D6C2)
private val Muted = Color(0xFF9298A8)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { VynodeTheme { VynodeTvApp() } }
    }
}

data class TvState(val config: ServerConfig = ServerConfig(), val loading: Boolean = false, val titles: List<MediaTitle> = emptyList(), val trailers: Map<String, String> = emptyMap(), val error: String? = null, val selected: MediaTitle? = null, val playing: Episode? = null)

class TvViewModel(application: Application) : AndroidViewModel(application) {
    private val store = ServerConfigStore(application)
    var state by mutableStateOf(TvState(config = store.load())); private set
    init { if (state.config.url.isNotBlank() && state.config.token.isNotBlank()) refresh() }
    fun configure(url: String, allowHttp: Boolean, code: String) {
        val normalized = ServerConfigStore.normalize(url)
        ServerConfigStore.validate(normalized, allowHttp)?.let { state = state.copy(error = it); return }
        state = state.copy(loading = true, error = null)
        viewModelScope.launch { runCatching { withContext(Dispatchers.IO) { VynodeClient(ServerConfig(normalized, allowLocalHttp = allowHttp)).claim(code) } }.onSuccess { token ->
            val config = ServerConfig(normalized, token, allowHttp); store.save(config); state = state.copy(config = config, loading = false); refresh()
        }.onFailure { state = state.copy(loading = false, error = it.message) } }
    }
    fun refresh() { state = state.copy(loading = true, error = null); viewModelScope.launch { runCatching { withContext(Dispatchers.IO) { VynodeClient(state.config).let { it.library() to it.trailers() } } }.onSuccess { state = state.copy(loading = false, titles = it.first, trailers = it.second) }.onFailure { state = state.copy(loading = false, error = it.message) } } }
    fun select(item: MediaTitle?) { state = state.copy(selected = item, playing = null) }
    fun play(item: MediaTitle, episode: Episode? = null) { state = state.copy(selected = item, playing = episode ?: Episode(item.id, item.title, 0, 0, item.progress)) }
    fun stop() { state = state.copy(playing = null) }
    fun disconnect() { store.clear(); state = TvState() }
    fun saveProgress(id: String, value: Float) { viewModelScope.launch(Dispatchers.IO) { runCatching { VynodeClient(state.config).progress(id, value) } } }
}

@Composable private fun VynodeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Purple, secondary = Teal, background = Ink, surface = Panel), content = content)
}

@Composable fun VynodeTvApp(vm: TvViewModel = viewModel()) {
    val state = vm.state
    when {
        state.config.url.isBlank() || state.config.token.isBlank() -> ConnectScreen(state, vm::configure)
        state.playing != null && state.selected != null -> PlayerScreen(state.config, state.playing, vm::stop) { vm.saveProgress(state.playing.id, it) }
        state.selected != null -> DetailScreen(state.selected, state.trailers[state.selected.id], vm::select, vm::play)
        else -> HomeScreen(state, vm::refresh, vm::select, vm::disconnect)
    }
}

@Composable private fun ConnectScreen(state: TvState, connect: (String, Boolean, String) -> Unit) {
    var url by rememberSaveable { mutableStateOf("https://") }
    var code by rememberSaveable { mutableStateOf("") }
    var localHttp by rememberSaveable { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(Color(0xFF292052), Ink))).padding(horizontal = 96.dp, vertical = 54.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.width(760.dp).background(Panel.copy(alpha = .96f), RoundedCornerShape(24.dp)).border(1.dp, Color(0xFF343A4A), RoundedCornerShape(24.dp)).padding(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Brand()
            Text("Connect your Vynode server", fontSize = 32.sp, fontWeight = FontWeight.Bold)
            Text("Start pairing in Vynode on Windows, Docker, or Unraid, then enter the server address and code.", color = Muted, fontSize = 18.sp, modifier = Modifier.padding(12.dp, 24.dp))
            TvTextField(url, { url = it }, "Server URL", Modifier.fillMaxWidth())
            Spacer(Modifier.height(14.dp))
            TvTextField(code, { code = it.uppercase().take(20) }, "Pairing code", Modifier.fillMaxWidth(), true)
            Spacer(Modifier.height(14.dp))
            FocusSurface(onClick = { localHttp = !localHttp }, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Text(if (localHttp) "✓" else "○", color = if (localHttp) Teal else Muted, fontSize = 24.sp); Spacer(Modifier.width(14.dp)); Column { Text("Trust local-network HTTP server", fontSize = 18.sp); Text("Only permits private 10.x, 172.16–31.x, 192.168.x, localhost, or .local addresses.", color = Muted, fontSize = 14.sp) } }
            }
            state.error?.let { Text(it, color = Color(0xFFFF8C9B), modifier = Modifier.padding(14.dp)) }
            Button(onClick = { connect(url, localHttp, code) }, enabled = !state.loading && code.isNotBlank(), modifier = Modifier.padding(top = 16.dp)) { Text(if (state.loading) "CONNECTING…" else "PAIR & CONNECT", fontSize = 18.sp) }
        }
    }
}

@Composable private fun HomeScreen(state: TvState, refresh: () -> Unit, select: (MediaTitle) -> Unit, disconnect: () -> Unit) {
    var filter by rememberSaveable { mutableStateOf("All") }
    val visible = state.titles.filter { filter == "All" || (filter == "Movies" && it.kind == "Movie") || (filter == "TV" && it.kind == "Series") }
    Column(Modifier.fillMaxSize().background(Ink).padding(horizontal = 72.dp, vertical = 42.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Brand(); Spacer(Modifier.weight(1f))
            listOf("All", "Movies", "TV").forEach { value -> Button(onClick = { filter = value }, colors = ButtonDefaults.colors(containerColor = if (filter == value) Purple else Panel), modifier = Modifier.padding(horizontal = 5.dp)) { Text(value) } }
            Button(onClick = refresh, modifier = Modifier.padding(start = 18.dp)) { Text("Refresh") }
            Button(onClick = disconnect, colors = ButtonDefaults.colors(containerColor = Color(0xFF351921)), modifier = Modifier.padding(start = 8.dp)) { Text("Disconnect") }
        }
        Text("YOUR MEDIA", color = Purple, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, modifier = Modifier.padding(top = 38.dp))
        Text(if (filter == "All") "Combined Library" else filter, fontSize = 42.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(vertical = 8.dp))
        if (state.loading) Text("Loading libraries…", color = Muted, fontSize = 18.sp)
        state.error?.let { Text(it, color = Color(0xFFFF8C9B), fontSize = 18.sp) }
        if (!state.loading && visible.isEmpty()) Text("No titles are available in this view.", color = Muted, fontSize = 20.sp, modifier = Modifier.padding(top = 50.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(22.dp), contentPadding = PaddingValues(vertical = 26.dp, horizontal = 8.dp)) { items(visible, key = { it.id }) { item -> PosterCard(item) { select(item) } } }
    }
}

@Composable private fun PosterCard(item: MediaTitle, onClick: () -> Unit) {
    FocusSurface(onClick = onClick, modifier = Modifier.width(205.dp)) {
        Column { Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).background(Brush.linearGradient(listOf(Color.hsv(item.hue.toFloat(), .62f, .55f), Color(0xFF10121A))), RoundedCornerShape(14.dp)).padding(16.dp), contentAlignment = Alignment.BottomStart) { Text(item.title.uppercase(), fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 22.sp) }; Text(item.title, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(top = 12.dp)); Text("${item.kind}  •  ${item.libraryName}", color = Muted, fontSize = 14.sp, maxLines = 1) }
    }
}

@Composable private fun DetailScreen(item: MediaTitle, trailer: String?, close: (MediaTitle?) -> Unit, play: (MediaTitle, Episode?) -> Unit) {
    val context = LocalContext.current
    androidx.activity.compose.BackHandler { close(null) }
    LazyColumn(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.hsv(item.hue.toFloat(), .55f, .28f), Ink), endY = 650f)).padding(horizontal = 80.dp, vertical = 52.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Text("‹ BACK", color = Muted, fontSize = 18.sp, modifier = Modifier.focusable().onKeyEvent { if (it.type == KeyEventType.KeyUp && (it.key == Key.Enter || it.key == Key.DirectionCenter)) { close(null); true } else false }.clickable { close(null) }.padding(12.dp)); Text(item.kind.uppercase(), color = Purple, fontWeight = FontWeight.Bold, letterSpacing = 2.sp); Text(item.title, fontSize = 52.sp, fontWeight = FontWeight.ExtraBold); Text(listOf(item.year, item.libraryName).filter { it.isNotBlank() }.joinToString("  •  "), color = Muted, fontSize = 19.sp); Row { if (item.kind == "Movie") Button(onClick = { play(item, null) }, modifier = Modifier.padding(vertical = 12.dp, horizontal = 4.dp)) { Text("▶  PLAY", fontSize = 20.sp) }; if (!trailer.isNullOrBlank()) Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(trailer))) }, colors = ButtonDefaults.colors(containerColor = Panel), modifier = Modifier.padding(vertical = 12.dp, horizontal = 4.dp)) { Text("WATCH TRAILER", fontSize = 18.sp) } } }
        if (item.seasons.isNotEmpty()) item.seasons.forEach { season ->
            item { Text(season.title, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 18.dp)) }
            items(season.episodes, key = { it.id }) { episode -> FocusSurface(onClick = { play(item, episode) }, modifier = Modifier.fillMaxWidth()) { Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(64.dp).background(Purple, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) { Text("▶", fontSize = 22.sp) }; Spacer(Modifier.width(20.dp)); Column { Text("${episode.episode}. ${episode.title}", fontSize = 21.sp, fontWeight = FontWeight.Bold); Text("Season ${episode.season} • ${if (episode.progress > 0) "${(episode.progress * 100).toInt()}% watched" else "Unplayed"}", color = Muted, fontSize = 15.sp) } } } }
        }
    }
}

@UnstableApi
@Composable private fun PlayerScreen(config: ServerConfig, episode: Episode, close: () -> Unit, progress: (Float) -> Unit) {
    val context = LocalContext.current
    val player = remember(config.url, episode.id) {
        val headers = if (config.token.isBlank()) emptyMap() else mapOf("Authorization" to "Bearer ${config.token}")
        ExoPlayer.Builder(context).setMediaSourceFactory(ProgressiveMediaSource.Factory(DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers))).build().apply { setMediaItem(MediaItem.fromUri(VynodeClient(config).streamUrl(episode.id))); prepare(); seekTo((episode.progress * duration.coerceAtLeast(0)).toLong()); playWhenReady = true }
    }
    fun stop() { if (player.duration > 0) progress((player.currentPosition.toFloat() / player.duration).coerceIn(0f, 1f)); player.release(); close() }
    androidx.activity.compose.BackHandler { stop() }
    DisposableEffect(player) { onDispose { player.release() } }
    Box(Modifier.fillMaxSize().background(Color.Black).onPreviewKeyEvent { event -> if (event.type != KeyEventType.KeyDown) false else when (event.key) { Key.DirectionCenter, Key.Enter, Key.MediaPlayPause, Key.ButtonA -> { if (player.isPlaying) player.pause() else player.play(); true }; Key.DirectionLeft -> { player.seekBack(); true }; Key.DirectionRight -> { player.seekForward(); true }; Key.Back, Key.Escape, Key.ButtonB -> { stop(); true }; else -> false } }.focusable()) {
        AndroidView(factory = { PlayerView(it).apply { useController = true; this.player = player } }, modifier = Modifier.fillMaxSize())
        Text("BACK  Exit   •   ◀/▶ Seek   •   SELECT Play/Pause", color = Color.White, modifier = Modifier.align(Alignment.TopStart).background(Color.Black.copy(alpha = .65f), RoundedCornerShape(8.dp)).padding(16.dp).offset(42.dp, 26.dp), fontSize = 16.sp)
    }
}

@Composable private fun Brand() { Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 20.dp)) { Box(Modifier.size(44.dp).background(Brush.linearGradient(listOf(Purple, Teal)), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) { Text("V", fontWeight = FontWeight.ExtraBold, fontSize = 24.sp) }; Text(" VYNODE MEDIA", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, letterSpacing = 1.sp) } }

@Composable private fun FocusSurface(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (focused) 1.06f else 1f, label = "focusScale")
    val border by animateColorAsState(if (focused) Teal else Color.Transparent, label = "focusBorder")
    Box(modifier.scale(scale).clip(RoundedCornerShape(14.dp)).border(BorderStroke(if (focused) 3.dp else 1.dp, border), RoundedCornerShape(14.dp)).onFocusChanged { focused = it.isFocused }.onKeyEvent { if (it.type == KeyEventType.KeyUp && (it.key == Key.Enter || it.key == Key.DirectionCenter || it.key == Key.ButtonA)) { onClick(); true } else false }.clickable(onClick = onClick).focusable().padding(3.dp)) { content() }
}

@Composable private fun TvTextField(value: String, onValueChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, caps: Boolean = false) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier.background(Color(0xFF0A0C12), RoundedCornerShape(10.dp)).border(if (focused) 3.dp else 1.dp, if (focused) Teal else Color(0xFF3A4050), RoundedCornerShape(10.dp)).padding(14.dp)) { Text(label, color = if (focused) Teal else Muted, fontSize = 13.sp); BasicTextField(value, onValueChange, textStyle = TextStyle(color = Color.White, fontSize = 21.sp, letterSpacing = if (caps) 2.sp else 0.sp), cursorBrush = SolidColor(Teal), singleLine = true, keyboardOptions = KeyboardOptions(capitalization = if (caps) KeyboardCapitalization.Characters else KeyboardCapitalization.None), modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }.padding(top = 5.dp)) }
}
