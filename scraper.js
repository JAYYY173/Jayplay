// ADVANCED SCRAPING UTILITIES FOR JAY PLAYER

class AdvancedScraper {
    constructor() {
        this.proxies = [
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://cors-anywhere.herokuapp.com/',
            'https://thingproxy.freeboard.io/fetch/'
        ];
        this.currentProxyIndex = 0;
    }
    
    async fetchWithProxy(url, options = {}) {
        for (let i = 0; i < this.proxies.length; i++) {
            const proxyIndex = (this.currentProxyIndex + i) % this.proxies.length;
            const proxyUrl = this.proxies[proxyIndex] + encodeURIComponent(url);
            
            try {
                const response = await fetch(proxyUrl, {
                    ...options,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        ...options.headers
                    }
                });
                
                if (response.ok) {
                    this.currentProxyIndex = proxyIndex;
                    return response;
                }
            } catch (error) {
                continue;
            }
        }
        throw new Error('All proxies failed');
    }
    
    // Extract YouTube video ID from various URL formats
    extractYouTubeId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/user\/[^/]+\/?#([a-zA-Z0-9_-]{11})/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }
    
    // Get YouTube video info without API
    async getYouTubeVideoInfo(videoId) {
        try {
            const url = `https://www.youtube.com/watch?v=${videoId}`;
            const response = await this.fetchWithProxy(url);
            const html = await response.text();
            
            // Extract info from meta tags
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const title = doc.querySelector('meta[property="og:title"]')?.content || 
                         doc.title.replace(' - YouTube', '');
            
            const description = doc.querySelector('meta[property="og:description"]')?.content || '';
            const thumbnail = doc.querySelector('meta[property="og:image"]')?.content || '';
            const channel = doc.querySelector('link[itemprop="name"]')?.content || 
                          doc.querySelector('.ytd-channel-name a')?.textContent || 'Unknown';
            
            // Extract duration from page
            const durationMatch = html.match(/"approxDurationMs":"(\d+)"/);
            const durationMs = durationMatch ? parseInt(durationMatch[1]) : 0;
            const duration = this.formatDuration(durationMs);
            
            return {
                id: videoId,
                title: title,
                description: description,
                artist: channel,
                duration: duration,
                thumbnail: thumbnail,
                views: this.extractViews(html),
                uploadDate: this.extractUploadDate(html)
            };
            
        } catch (error) {
            console.error('YouTube info error:', error);
            return null;
        }
    }
    
    formatDuration(ms) {
        if (!ms) return '0:00';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    
    extractViews(html) {
        const viewMatch = html.match(/"viewCount":"(\d+)"/) || 
                         html.match(/"simpleText":"([\d,]+)\s*views"/i);
        return viewMatch ? viewMatch[1] : '0';
    }
    
    extractUploadDate(html) {
        const dateMatch = html.match(/"uploadDate":"([^"]+)"/) ||
                         html.match(/"dateText":{"simpleText":"([^"]+)"}/);
        return dateMatch ? dateMatch[1] : '';
    }
    
    // Search multiple sources
    async multiSourceSearch(query) {
        const sources = [
            this.searchYouTube(query),
            this.searchSoundCloud(query),
            this.searchBandcamp(query)
        ];
        
        try {
            const results = await Promise.allSettled(sources);
            const allResults = [];
            
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    allResults.push(...result.value);
                }
            });
            
            // Remove duplicates
            const uniqueResults = [];
            const seenIds = new Set();
            
            for (const track of allResults) {
                if (!seenIds.has(track.id)) {
                    seenIds.add(track.id);
                    uniqueResults.push(track);
                }
            }
            
            return uniqueResults.slice(0, 50); // Limit to 50 results
            
        } catch (error) {
            console.error('Multi-source search error:', error);
            return [];
        }
    }
    
    async searchYouTube(query) {
        // Use YouTube's search endpoint via proxy
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`; // Videos only
        
        try {
            const response = await this.fetchWithProxy(searchUrl);
            const html = await response.text();
            
            // Parse initial data
            const initialDataMatch = html.match(/var ytInitialData = (\{.*?\});/);
            if (!initialDataMatch) return [];
            
            const data = JSON.parse(initialDataMatch[1]);
            const videos = [];
            
            // Navigate through the complex YouTube data structure
            const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
            
            for (const content of contents) {
                const items = content.itemSectionRenderer?.contents || [];
                for (const item of items) {
                    const video = item.videoRenderer;
                    if (video && video.videoId) {
                        videos.push({
                            id: video.videoId,
                            title: video.title?.runs?.[0]?.text || 'Unknown',
                            artist: video.ownerText?.runs?.[0]?.text || 'Unknown',
                            duration: video.lengthText?.simpleText || '0:00',
                            thumbnail: video.thumbnail?.thumbnails?.[0]?.url || '',
                            views: video.viewCountText?.simpleText || '0 views',
                            type: 'youtube'
                        });
                    }
                }
            }
            
            return videos;
            
        } catch (error) {
            console.error('YouTube search error:', error);
            return [];
        }
    }
    
    async searchSoundCloud(query) {
        try {
            const searchUrl = `https://soundcloud.com/search?q=${encodeURIComponent(query)}`;
            const response = await this.fetchWithProxy(searchUrl);
            const html = await response.text();
            
            const tracks = [];
            // SoundCloud has a specific data structure
            const scriptMatch = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/);
            
            if (scriptMatch) {
                const data = JSON.parse(scriptMatch[1]);
                const trackData = data.find(item => item.hydratable === 'search');
                
                if (trackData?.data?.collection) {
                    trackData.data.collection.forEach(item => {
                        if (item.kind === 'track') {
                            tracks.push({
                                id: `sc_${item.id}`,
                                title: item.title || 'Unknown',
                                artist: item.user?.username || 'Unknown',
                                duration: this.formatDuration(item.duration || 0),
                                thumbnail: item.artwork_url || item.user?.avatar_url || '',
                                type: 'soundcloud',
                                url: item.permalink_url
                            });
                        }
                    });
                }
            }
            
            return tracks;
            
        } catch (error) {
            console.error('SoundCloud search error:', error);
            return [];
        }
    }
    
    async searchBandcamp(query) {
        try {
            const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}`;
            const response = await this.fetchWithProxy(searchUrl);
            const html = await response.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const tracks = [];
            const items = doc.querySelectorAll('.searchresult');
            
            items.forEach(item => {
                const type = item.querySelector('.itemtype')?.textContent?.trim();
                if (type === 'Track') {
                    const title = item.querySelector('.heading')?.textContent?.trim();
                    const artist = item.querySelector('.subhead')?.textContent?.trim();
                    const thumb = item.querySelector('.art')?.getAttribute('src');
                    
                    if (title && artist) {
                        tracks.push({
                            id: `bc_${Date.now()}_${tracks.length}`,
                            title: title,
                            artist: artist.replace('by ', ''),
                            duration: 'Unknown',
                            thumbnail: thumb || '',
                            type: 'bandcamp'
                        });
                    }
                }
            });
            
            return tracks;
            
        } catch (error) {
            console.error('Bandcamp search error:', error);
            return [];
        }
    }
    
    // Get direct streaming URL from various sources
    async getStreamUrl(track) {
        switch (track.type) {
            case 'youtube':
                return await this.getYouTubeStream(track.id);
            case 'soundcloud':
                return await this.getSoundCloudStream(track.url);
            default:
                return track.url || null;
        }
    }
    
    async getYouTubeStream(videoId) {
        // Try various YouTube streaming services
        const services = [
            `https://api.r4j4x.workers.dev/download?id=${videoId}`,
            `https://yt1s.com/api/ajaxSearch?id=${videoId}`,
            `https://co.wuk.sh/api/json?url=https://youtu.be/${videoId}`,
            `https://youtubei.googleapis.com/youtubei/v1/player?videoId=${videoId}&key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`
        ];
        
        for (const service of services) {
            try {
                const response = await fetch(service);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Different services return different formats
                    if (data.downloadUrl) return data.downloadUrl;
                    if (data.url) return data.url;
                    if (data.streamingData?.adaptiveFormats) {
                        // Find audio-only format
                        const audioFormat = data.streamingData.adaptiveFormats.find(
                            f => f.mimeType.includes('audio') && f.url
                        );
                        if (audioFormat?.url) return audioFormat.url;
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        // Fallback to embed
        return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
    
    async getSoundCloudStream(trackUrl) {
        try {
            const response = await this.fetchWithProxy(trackUrl);
            const html = await response.text();
            
            // Extract stream URL from SoundCloud widget
            const streamMatch = html.match(/"url":"([^"]+stream[^"]+)"/);
            if (streamMatch) {
                return JSON.parse(`"${streamMatch[1]}"`); // Unescape JSON string
            }
            
            // Alternative extraction
            const clientIdMatch = html.match(/client_id:\s*"([^"]+)"/);
            const trackIdMatch = html.match(/"id":(\d+)/);
            
            if (clientIdMatch && trackIdMatch) {
                const clientId = clientIdMatch[1];
                const trackId = trackIdMatch[1];
                return `https://api.soundcloud.com/tracks/${trackId}/stream?client_id=${clientId}`;
            }
            
        } catch (error) {
            console.error('SoundCloud stream error:', error);
        }
        
        return null;
    }
}

// Export scraper globally
window.AdvancedScraper = AdvancedScraper;