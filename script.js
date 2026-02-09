// JAY PLAYER - MAIN JAVASCRIPT FILE
// Pure YouTube & Spotify Scraping - No API

class JayPlayer {
    constructor() {
        this.currentTrack = null;
        this.queue = [];
        this.playHistory = [];
        this.isPlaying = false;
        this.volume = 0.7;
        this.shuffle = false;
        this.repeat = 'none'; // none, one, all
        this.currentPlaylist = null;
        this.likedSongs = new Set();
        
        this.audio = new Audio();
        this.audio.volume = this.volume;
        
        this.init();
    }
    
    init() {
        // Hide loading screen after 2 seconds
        setTimeout(() => {
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('appContainer').style.display = 'flex';
            this.loadInitialData();
        }, 2000);
        
        // Event Listeners
        this.setupEventListeners();
        this.setupAudioEvents();
    }
    
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchPage(item.dataset.page);
            });
        });
        
        // Search
        document.getElementById('searchBox').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch(e.target.value);
            }
        });
        
        document.querySelector('.search-box i').addEventListener('click', () => {
            this.performSearch(document.getElementById('searchBox').value);
        });
        
        // Player Controls
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlay());
        document.querySelector('.prev-btn').addEventListener('click', () => this.prevTrack());
        document.querySelector('.next-btn').addEventListener('click', () => this.nextTrack());
        document.querySelector('.shuffle-btn').addEventListener('click', () => this.toggleShuffle());
        document.querySelector('.repeat-btn').addEventListener('click', () => this.toggleRepeat());
        
        // Volume Control
        document.querySelector('.volume-btn').addEventListener('click', () => this.toggleMute());
        document.querySelector('.volume-slider').addEventListener('click', (e) => {
            const rect = e.target.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.setVolume(percent);
        });
        
        // Progress Bar
        document.querySelector('.progress-bar').addEventListener('click', (e) => {
            const rect = e.target.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.seek(percent);
        });
        
        // Like Button
        document.querySelector('.like-btn').addEventListener('click', () => this.toggleLike());
    }
    
    setupAudioEvents() {
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.onTrackEnd());
        this.audio.addEventListener('loadedmetadata', () => this.onTrackLoaded());
        this.audio.addEventListener('error', (e) => this.onAudioError(e));
    }
    
    // ==================== YOUTUBE SCRAPING METHODS ====================
    
    async scrapeYouTubeSearch(query) {
        try {
            this.showToast(`Searching YouTube for: ${query}`, 'info');
            
            // Use CORS proxy to avoid CORS issues
            const proxyUrl = 'https://corsproxy.io/?';
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            
            const response = await fetch(proxyUrl + encodeURIComponent(searchUrl), {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const videos = [];
            
            // Extract video data from HTML
            const scripts = doc.querySelectorAll('script');
            let videoData = null;
            
            for (const script of scripts) {
                const text = script.textContent;
                if (text.includes('var ytInitialData')) {
                    const start = text.indexOf('var ytInitialData = ') + 20;
                    const end = text.indexOf('};', start) + 1;
                    const jsonStr = text.substring(start, end);
                    try {
                        const data = JSON.parse(jsonStr);
                        videoData = data;
                        break;
                    } catch (e) {
                        console.error('Failed to parse YouTube data:', e);
                    }
                }
            }
            
            if (videoData) {
                const contents = videoData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
                
                for (const content of contents) {
                    const items = content.itemSectionRenderer?.contents || [];
                    for (const item of items) {
                        const video = item.videoRenderer;
                        if (video) {
                            const videoInfo = {
                                id: video.videoId,
                                title: video.title?.runs?.[0]?.text || 'Unknown Title',
                                artist: video.ownerText?.runs?.[0]?.text || 'Unknown Artist',
                                duration: video.lengthText?.simpleText || '0:00',
                                thumbnail: video.thumbnail?.thumbnails?.[0]?.url || '',
                                url: `https://www.youtube.com/watch?v=${video.videoId}`,
                                type: 'youtube',
                                views: video.viewCountText?.simpleText || '0 views'
                            };
                            videos.push(videoInfo);
                        }
                    }
                }
            }
            
            return videos.slice(0, 20); // Return first 20 results
            
        } catch (error) {
            console.error('YouTube scraping error:', error);
            this.showToast('Failed to search YouTube', 'error');
            return [];
        }
    }
    
    async getYouTubeStreamUrl(videoId) {
        try {
            // Use external service to get direct audio stream
            // Note: This is a simplified version. For production, use yt-dlp server-side
            const services = [
                `https://api.r4j4x.workers.dev/download?id=${videoId}`,
                `https://yt1s.com/api/ajaxSearch?id=${videoId}`,
                `https://co.wuk.sh/api/json?url=https://youtu.be/${videoId}`
            ];
            
            for (const service of services) {
                try {
                    const response = await fetch(service);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.downloadUrl || data.url) {
                            return data.downloadUrl || data.url;
                        }
                    }
                } catch (e) {
                    continue;
                }
            }
            
            // Fallback to YouTube embed
            return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            
        } catch (error) {
            console.error('Stream URL error:', error);
            return null;
        }
    }
    
    // ==================== SPOTIFY SCRAPING METHODS ====================
    
    async scrapeSpotifySearch(query) {
        try {
            this.showToast(`Searching Spotify for: ${query}`, 'info');
            
            const proxyUrl = 'https://corsproxy.io/?';
            const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
            
            const response = await fetch(proxyUrl + encodeURIComponent(spotifyUrl));
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const tracks = [];
            
            // Extract track information
            const trackElements = doc.querySelectorAll('[data-testid="tracklist-row"]');
            
            trackElements.forEach((element, index) => {
                if (index < 10) { // Limit to 10 results
                    const title = element.querySelector('[data-testid="tracklist-row-track-name"]')?.textContent || 'Unknown';
                    const artist = element.querySelector('[data-testid="tracklist-row-artist-name"]')?.textContent || 'Unknown';
                    const duration = element.querySelector('[data-testid="tracklist-row-duration"]')?.textContent || '0:00';
                    
                    tracks.push({
                        id: `spotify_${Date.now()}_${index}`,
                        title: title,
                        artist: artist,
                        duration: duration,
                        thumbnail: 'https://i.scdn.co/image/ab67616d0000b273', // Default Spotify image
                        type: 'spotify',
                        source: 'spotify'
                    });
                }
            });
            
            return tracks;
            
        } catch (error) {
            console.error('Spotify scraping error:', error);
            return [];
        }
    }
    
    // ==================== PLAYER CONTROLS ====================
    
    async playTrack(track) {
        try {
            this.currentTrack = track;
            this.isPlaying = true;
            
            // Update UI
            document.getElementById('nowPlayingTitle').textContent = track.title;
            document.getElementById('nowPlayingArtist').textContent = track.artist;
            document.getElementById('nowPlayingImg').querySelector('img').src = track.thumbnail;
            
            // Get stream URL based on track type
            let streamUrl;
            
            if (track.type === 'youtube') {
                streamUrl = await this.getYouTubeStreamUrl(track.id);
            } else {
                streamUrl = track.url || track.previewUrl;
            }
            
            if (streamUrl) {
                this.audio.src = streamUrl;
                this.audio.play().catch(e => {
                    console.error('Play error:', e);
                    this.showToast('Cannot play this track', 'error');
                });
                
                // Update play button
                document.getElementById('playBtn').innerHTML = '<i class="fas fa-pause"></i>';
                
                // Add to history
                this.addToHistory(track);
                
                this.showToast(`Now playing: ${track.title}`, 'success');
            } else {
                this.showToast('No playable stream found', 'error');
            }
            
        } catch (error) {
            console.error('Play track error:', error);
            this.showToast('Failed to play track', 'error');
        }
    }
    
    togglePlay() {
        if (this.currentTrack) {
            if (this.isPlaying) {
                this.audio.pause();
                document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i>';
            } else {
                this.audio.play();
                document.getElementById('playBtn').innerHTML = '<i class="fas fa-pause"></i>';
            }
            this.isPlaying = !this.isPlaying;
        }
    }
    
    nextTrack() {
        if (this.queue.length > 0) {
            const nextTrack = this.shuffle ? 
                this.queue[Math.floor(Math.random() * this.queue.length)] : 
                this.queue.shift();
            this.playTrack(nextTrack);
        }
    }
    
    prevTrack() {
        if (this.playHistory.length > 1) {
            this.playHistory.pop(); // Remove current
            const prevTrack = this.playHistory.pop();
            if (prevTrack) {
                this.playTrack(prevTrack);
            }
        }
    }
    
    toggleShuffle() {
        this.shuffle = !this.shuffle;
        const btn = document.querySelector('.shuffle-btn');
        btn.style.color = this.shuffle ? 'var(--primary-purple)' : 'var(--text-secondary)';
        this.showToast(this.shuffle ? 'Shuffle: ON' : 'Shuffle: OFF', 'info');
    }
    
    toggleRepeat() {
        const modes = ['none', 'one', 'all'];
        const currentIndex = modes.indexOf(this.repeat);
        this.repeat = modes[(currentIndex + 1) % modes.length];
        
        const btn = document.querySelector('.repeat-btn');
        btn.style.color = this.repeat !== 'none' ? 'var(--primary-purple)' : 'var(--text-secondary)';
        btn.innerHTML = this.repeat === 'one' ? 
            '<i class="fas fa-redo-alt"></i>' : 
            '<i class="fas fa-redo"></i>';
        
        this.showToast(`Repeat: ${this.repeat.toUpperCase()}`, 'info');
    }
    
    toggleLike() {
        if (this.currentTrack) {
            const btn = document.querySelector('.like-btn');
            if (this.likedSongs.has(this.currentTrack.id)) {
                this.likedSongs.delete(this.currentTrack.id);
                btn.innerHTML = '<i class="far fa-heart"></i>';
                this.showToast('Removed from Liked Songs', 'info');
            } else {
                this.likedSongs.add(this.currentTrack.id);
                btn.innerHTML = '<i class="fas fa-heart" style="color: #1DB954"></i>';
                this.showToast('Added to Liked Songs', 'success');
            }
        }
    }
    
    // ==================== UI METHODS ====================
    
    switchPage(pageId) {
        // Update active menu item
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
        
        // Show correct page
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(`${pageId}Page`).classList.add('active');
    }
    
    async performSearch(query) {
        if (!query.trim()) return;
        
        this.switchPage('search');
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="search-loading">
                <div class="spinner"></div>
                <p>Searching for "${query}"...</p>
            </div>
        `;
        
        // Search both YouTube and Spotify
        const [youtubeResults, spotifyResults] = await Promise.all([
            this.scrapeYouTubeSearch(query),
            this.scrapeSpotifySearch(query)
        ]);
        
        const allResults = [...youtubeResults, ...spotifyResults];
        
        if (allResults.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h3>No results found for "${query}"</h3>
                    <p>Try different keywords or check your connection</p>
                </div>
            `;
            return;
        }
        
        // Display results
        resultsContainer.innerHTML = `
            <div class="results-header">
                <h2>Search Results for "${query}"</h2>
                <p>${allResults.length} tracks found</p>
            </div>
            <div class="results-grid">
                ${allResults.map((track, index) => `
                    <div class="result-card" data-index="${index}">
                        <div class="result-img">
                            <img src="${track.thumbnail}" alt="${track.title}" onerror="this.src='https://via.placeholder.com/150'">
                            <button class="play-result-btn" data-track='${JSON.stringify(track).replace(/'/g, "\\'")}'>
                                <i class="fas fa-play"></i>
                            </button>
                        </div>
                        <div class="result-info">
                            <h4>${this.truncateText(track.title, 30)}</h4>
                            <p>${track.artist}</p>
                            <span class="result-duration">${track.duration}</span>
                            <span class="result-source">${track.type}</span>
                        </div>
                        <button class="result-queue-btn" data-track='${JSON.stringify(track).replace(/'/g, "\\'")}'>
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add event listeners to result cards
        resultsContainer.querySelectorAll('.play-result-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const track = JSON.parse(btn.dataset.track);
                this.playTrack(track);
            });
        });
        
        resultsContainer.querySelectorAll('.result-queue-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const track = JSON.parse(btn.dataset.track);
                this.addToQueue(track);
                this.showToast(`Added "${track.title}" to queue`, 'success');
            });
        });
    }
    
    // ==================== HELPER METHODS ====================
    
    addToHistory(track) {
        this.playHistory.push(track);
        if (this.playHistory.length > 50) {
            this.playHistory.shift();
        }
    }
    
    addToQueue(track) {
        this.queue.push(track);
        this.updateQueueDisplay();
    }
    
    updateProgress() {
        if (this.audio.duration) {
            const percent = (this.audio.currentTime / this.audio.duration) * 100;
            document.getElementById('progressFill').style.width = `${percent}%`;
            document.getElementById('progressThumb').style.left = `${percent}%`;
            
            document.getElementById('currentTime').textContent = 
                this.formatTime(this.audio.currentTime);
            document.getElementById('totalTime').textContent = 
                this.formatTime(this.audio.duration);
        }
    }
    
    seek(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = this.audio.duration * percent;
        }
    }
    
    setVolume(percent) {
        this.volume = Math.max(0, Math.min(1, percent));
        this.audio.volume = this.volume;
        document.querySelector('.volume-fill').style.width = `${this.volume * 100}%`;
    }
    
    toggleMute() {
        this.audio.muted = !this.audio.muted;
        const btn = document.querySelector('.volume-btn i');
        btn.className = this.audio.muted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    }
    
    onTrackEnd() {
        if (this.repeat === 'one') {
            this.audio.currentTime = 0;
            this.audio.play();
        } else if (this.repeat === 'all' || this.queue.length > 0) {
            this.nextTrack();
        } else {
            this.isPlaying = false;
            document.getElementById('playBtn').innerHTML = '<i class="fas fa-play"></i>';
        }
    }
    
    onTrackLoaded() {
        document.getElementById('totalTime').textContent = 
            this.formatTime(this.audio.duration);
    }
    
    onAudioError(error) {
        console.er