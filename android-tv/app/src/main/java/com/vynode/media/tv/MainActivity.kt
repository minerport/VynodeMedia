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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
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

data class TvState(val config: ServerConfig = ServerConfig(), val accountToken: String = "", val servers: List<CloudServer> = emptyList(), val loading: Boolean = false, val titles: List<MediaTitle> = emptyList(), val trailers: Map<String, String> = emptyMap(), val error: String? = null, val selected: MediaTitle? = null, val playing: Episode? = null)

class TvViewModel(application: Application) : AndroidViewModel(application) {
    private val store = ServerConfigStore(application)
    var state by mutableStateOf(TvState(config = store.load(), accountToken = store.accountToken())); private set
    init { when { state.accountToken.isBlank() -> Unit; state.config.url.isNotBlank() && state.config.token.isNotBlank() -> refresh(); else -> loadServers() } }
    fun login(email: String, password: String) { state = state.copy(loading = true, error = null); viewModelScope.launch { runCatching { withContext(Dispatchers.IO) { VynodeCloudClient().login(email, password) } }.onSuccess { token -> store.saveAccountToken(token); state = state.copy(accountToken = token, loading = false); loadServers() }.onFailure { state = state.copy(loading = false, error = it.message) } } }
    fun loadServers() { state = state.copy(loading = true, error = null); viewModelScope.launch { runCatching { withContext(Dispatchers.IO) { VynodeCloudClient(state.accountToken).servers() } }.onSuccess { state = state.copy(loading = false, servers = it) }.onFailure { state = state.copy(loading = false, error = it.message) } } }
    fun connect(server: CloudServer) { state = state.copy(loading = true, error = null); viewModelScope.launch { runCatching { withContext(Dispatchers.IO) {
        val ticket = VynodeCloudClient(state.accountToken).accessTicket(server.id)
        var lastError: Throwable? = null
        for (endpoint in server.endpoints) {
            try {
                val url = ServerConfigStore.normalize(endpoint)
                val allowHttp = url.startsWith("http://") && runCatching { ServerConfigStore.isPrivateHost(java.net.URI(url).host) }.getOrDefault(false)
                ServerConfigStore.validate(url, allowHttp)?.let { continue }
                val candidate = ServerConfig(url = url, allowLocalHttp = allowHttp, serverId = server.id, serverName = server.name)
                val token = VynodeClient(candidate).claimCloud(ticket)
                return@withContext candidate.copy(token = token)
            } catch (error: Throwable) { lastError = error }
        }
        throw lastError ?: IllegalStateException("This server has no reachable address.")
    } }.onSuccess { config -> store.save(config); state = state.copy(config = config, loading = false); refresh() }.onFailure { state = state.copy(loading = false, error = it.message) } } }
    fun refresh() { state = state.copy(loading = true, error = null); viewModelScope.launch { runCatching { withContext(Dispatchers.IO) { VynodeClient(state.config).let { it.library() to it.trailers() } } }.onSuccess { state = state.copy(loading = false, titles = it.first, trailers = it.second) }.onFailure { state = state.copy(loading = false, error = it.message) } } }
    fun select(item: MediaTitle?) { state = state.copy(selected = item, playing = null) }
    fun play(item: MediaTitle, episode: Episode? = null) { state = state.copy(selected = item, playing = episode ?: Episode(item.id, item.title, 0, 0, item.progress)) }
    fun stop() { state = state.copy(playing = null) }
    fun changeServer() { store.clearServer(); state = state.copy(config = ServerConfig(), titles = emptyList(), selected = null); loadServers() }
    fun logout() { store.clear(); state = TvState() }
    fun saveProgress(id: String, value: Float) { viewModelScope.launch(Dispatchers.IO) { runCatching { VynodeClient(state.config).progress(id, value) } } }
}

@Composable private fun VynodeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Purple, secondary = Teal, background = Ink, surface = Panel), content = content)
}

@Composable fun VynodeTvApp(vm: TvViewModel = viewModel()) {
    val state = vm.state
    when {
        state.accountToken.isBlank() -> SignInScreen(state, vm::login)
        state.config.url.isBlank() || state.config.token.isBlank() -> ServerScreen(state, vm::loadServers, vm::connect, vm::logout)
        state.playing != null && state.selected != null -> PlayerScreen(state.config, state.playing, vm::stop) { vm.saveProgress(state.playing.id, it) }
        state.selected != null -> DetailScreen(state.selected, state.trailers[state.selected.id], vm::select, vm::play)
        else -> HomeScreen(state, vm::refresh, vm::select, vm::changeServer)
    }
}

@Composable private fun SignInScreen(state: TvState, login: (String, String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(Brush.radialGradient(listOf(Color(0xFF292052), Ink))).padding(horizontal = 96.dp, vertical = 54.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.width(760.dp).background(Panel.copy(alpha = .96f), RoundedCornerShape(24.dp)).border(1.dp, Color(0xFF343A4A), RoundedCornerShape(24.dp)).padding(44.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Brand()
            Text("Sign in to Vynode", fontSize = 32.sp, fontWeight = FontWeight.Bold)
            Text("Your account securely finds every Vynode server you own.", color = Muted, fontSize = 18.sp, modifier = Modifier.padding(12.dp, 24.dp))
            TvTextField(email, { email = it }, "Email", Modifier.fillMaxWidth())
            Spacer(Modifier.height(14.dp))
            TvTextField(password, { password = it }, "Password", Modifier.fillMaxWidth(), password = true)
            state.error?.let { Text(it, color = Color(0xFFFF8C9B), modifier = Modifier.padding(14.dp)) }
            Button(onClick = { login(email, password) }, enabled = !state.loading && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.padding(top = 16.dp)) { Text(if (state.loading) "SIGNING IN…" else "SIGN IN", fontSize = 18.sp) }
        }
    }
}

@Composable private fun ServerScreen(state: TvState, refresh: () -> Unit, connect: (CloudServer) -> Unit, logout: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Ink).padding(horizontal = 80.dp, vertical = 52.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Brand(); Spacer(Modifier.weight(1f)); Button(onClick = refresh) { Text("Refresh") }; Button(onClick = logout, colors = ButtonDefaults.colors(containerColor = Color(0xFF351921)), modifier = Modifier.padding(start = 10.dp)) { Text("Sign out") } }
        Text("YOUR VYNODE ACCOUNT", color = Purple, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, modifier = Modifier.padding(top = 44.dp))
        Text("Choose a server", fontSize = 42.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(vertical = 10.dp))
        Text("Online servers can be opened immediately. No address or pairing code is required.", color = Muted, fontSize = 18.sp)
        state.error?.let { Text(it, color = Color(0xFFFF8C9B), fontSize = 18.sp, modifier = Modifier.padding(top = 14.dp)) }
        if (state.loading) Text("Loading your servers…", color = Muted, fontSize = 20.sp, modifier = Modifier.padding(top = 40.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(18.dp), contentPadding = PaddingValues(vertical = 30.dp)) {
            items(state.servers, key = { it.id }) { server -> FocusSurface(onClick = { if (server.online && !state.loading) connect(server) }, modifier = Modifier.fillMaxWidth()) { Row(Modifier.background(Panel, RoundedCornerShape(14.dp)).padding(24.dp), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(64.dp).background(Brush.linearGradient(listOf(Purple, Teal)), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Text("V", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold) }; Spacer(Modifier.width(22.dp)); Column(Modifier.weight(1f)) { Text(server.name, fontSize = 24.sp, fontWeight = FontWeight.Bold); Text("${server.endpoints.size} available address${if (server.endpoints.size == 1) "" else "es"}", color = Muted, fontSize = 15.sp) }; Text(if (server.online) "ONLINE  ›" else "OFFLINE", color = if (server.online) Teal else Color(0xFFFF8C9B), fontWeight = FontWeight.Bold) } } }
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

@Composable private fun TvTextField(value: String, onValueChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, caps: Boolean = false, password: Boolean = false) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier.background(Color(0xFF0A0C12), RoundedCornerShape(10.dp)).border(if (focused) 3.dp else 1.dp, if (focused) Teal else Color(0xFF3A4050), RoundedCornerShape(10.dp)).padding(14.dp)) { Text(label, color = if (focused) Teal else Muted, fontSize = 13.sp); BasicTextField(value, onValueChange, textStyle = TextStyle(color = Color.White, fontSize = 21.sp, letterSpacing = if (caps) 2.sp else 0.sp), cursorBrush = SolidColor(Teal), singleLine = true, visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None, keyboardOptions = KeyboardOptions(capitalization = if (caps) KeyboardCapitalization.Characters else KeyboardCapitalization.None), modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }.padding(top = 5.dp)) }
}
