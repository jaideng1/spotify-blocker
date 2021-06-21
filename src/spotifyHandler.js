const btoa = require("btoa");
const path = require("path");
const request = require("request");

const BASE_PLAYING = {
	isPlaying: false,
  times: {
    progress: 0,
    len: 0,
  },
  pubDetails: {
    name: "",
    by: "",
  },
  techDetails: {
    id: "",
    uri: "",
    isLocal: false
  },
  context: {
    trackNum: 0,
    albumID: "",
    album: {
  		lastAlbum: ".", //Used to track the album.
  		coverArt: "",
  	},
  },

  updateTime: 3000
}

function getAuthHeader(clientID, clientSecret) {
  return `Basic ` + btoa(clientID + ':' + clientSecret);
}

function getToken(spotifyData) {
  var options = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: spotifyData.authorizationCode,
        redirect_uri: spotifyData.REDIRECT_URI,
        grant_type: "authorization_code",
      },
      headers: {
          Authorization: spotifyData.authHeader,
      },
      json: true
  };

  return new Promise((resolve, reject) => {
    request.post(options, function (err, response, body) {
        if (err) {
          reject("Spotify isn't being used right now.")
          return;
        }

        if (response.statusCode === 200) {
          resolve({
            accessToken: body.access_token,
            expires: new Date().getTime() + (body.expires_in * 1000),
            tokenType: body.token_type,
            refreshToken: body.refresh_token
          })
        } else {
          console.log("There was an error getting a token.")
          reject("Response Code: " + response.statusCode)
        }
    });
  })
}

class SpotifyRequest {
  constructor(spotifyData, token, authorizationCode, state) {
    this.SPOTIFY_DATA = spotifyData;

    this.auth = {
      code: authorizationCode,
      state: state,
    }

    /*
      accessToken, expires, tokenType, refreshToken,
    */
    this.token = token;

    this.currentlyPlaying = BASE_PLAYING;

		this.stoppedRequests = {
			dueTo400: false,
			dueTo204: false
		}

    this.requestCurrentSongPlaying();

    this.requestCurrentlyPlaying = setInterval(() => {
      this.requestCurrentSongPlaying();
    }, this.currentlyPlaying.updateTime);

    this.blockedSongs = [];
  }

	/*
	* Gets the current playing song, and saves the data.
	*/
  requestCurrentSongPlaying() {
		//If the data is expired, get the new tokens, then return.
		if (this.expires < new Date().getTime()) { this.refreshSpotifyData(); return; };

		//Options for the request.
    var options = {
      url: "https://api.spotify.com/v1/me/player/currently-playing",
      method: "GET",
      headers: {
        Authorization: `${this.token.tokenType} ${this.token.accessToken}`,
        'Accept': "application/json"
      },
      timeout: 10000
    }

		//Send the request.
    request(options, (err, response, body) => {
			//If there's an error, don't continue.
      if (err) {
        console.log("There was an error getting the current song playing.")
        return;
      }

			//If the response is not successful.
      if (response.statusCode != 200) {
				//If the response is 202 or 204, send one message and reset the saved current song.
				if ([202, 204].includes(response.statusCode) && this.stoppedRequests.dueTo204) {
					console.log("Display stopping - Spotify returned no data back. " + ((response.statusCode == 204) ? "Most likely Spotify went inactive." : "Requests are taking too long to get back."));
					this.currentlyPlaying = BASE_CURRENTLY_PLAYING;
				} else if ([202, 204].includes(response.statusCode)) return;

				//If the response is 4XX or 5XX, send this message always.
        console.log("There was an error when getting Spotify data.");
        console.log("Response Code: " + response.statusCode);
				console.log((Math.floor(response.statusCode / 100) == 5) ? "(Spotify's fault.)" : "(This program's fault.)");

				if (response.statusCode < 500 && !this.stoppedRequests.dueTo400) {
					console.log("Stopping music due to error.")
					this.stoppedRequests.dueTo400 = true;
				}
      }

      try {
        let parsed = JSON.parse(body);

        this.currentlyPlaying.isPlaying = parsed.is_playing;

				this.currentlyPlaying.pubDetails = {
					name: parsed.item.name,
					by: parsed.item.artists
				}

        this.currentlyPlaying.times = {
					progress: parsed.progress_ms,
					len: parsed.item.duration_ms
				}

				this.currentlyPlaying.techDetails = {
					isLocal: parsed.is_local,
					id: parsed.item.id,
					uri: parsed.item.uri
				}

				this.currentlyPlaying.context.albumID = parsed.item.album.id;
				this.currentlyPlaying.context.trackNum = parsed.item.track_num;

				this.stoppedRequestsDueTo400Error = false;

        if (this.hasBlockedSong(parsed.item.external_ids.isrc)) {
          this.switchSong();
        }

				//Get the album cover (in another function due to it being a seperate request.)
        this.getAlbumCover();
      } catch (e) {
				//If there's an error while parsing it, catch it so it doesn't stop the whole program.
        console.log("There was an error parsing the data.", e)
      }
    });
  }

	/*
	* Gets the album cover's URL of the current playing song.
	*/
  getAlbumCover() {
		//If the token is expired, don't send a request.
		if (this.expires < new Date().getTime()) return;

		//If there's errors/the player is inactive, don't send a request.
		if (this.stoppedRequests.dueTo204 || this.stoppedRequests.dueTo400) return;

		//If the album ID is not saved, don't send a request.
		if (this.currentlyPlaying.context.albumID == "") return;

		//If the album has been changed.
    if (this.currentlyPlaying.context.album.lastAlbum == this.currentlyPlaying.context.albumID) return;

		//Options for request.
    var options = {
      url: "https://api.spotify.com/v1/albums/" + this.currentlyPlaying.context.albumID,
      method: "GET",
      headers: {
        Authorization: `${this.token.tokenType} ${this.token.accessToken}`,
        'Accept': "application/json"
      },
      timeout: 10000
    };

		//Send the request.
    request(options, (err, response, body) => {
      if (err) {
        console.log("There was an error getting an album cover.");
        throw err;
      }
      let parsed;

      try {
        parsed = JSON.parse(body);
      } catch (e) {
        //If there was an error parsing it, catch it.
        console.log("There was an error with parsing an album cover.")

        return;
      }

      //If the request is successful
      if (response.statusCode === 200) {
        //Get the 300 by 300 cover art, but if it's null, change it to the 64 x 64 version.
        this.currentlyPlaying.context.album.coverArt = parsed.images[1].url || parsed.images[0].url;

        this.currentlyPlaying.context.album.lastAlbum = this.currentlyPlaying.albumID;

      } else {
        //If it wasn't successful, send an error msg.
        console.log("There was an error with getting an album cover - most likely a wrong album ID. ERR MSG:", parsed.error.message)
      }
    });
  }
  
  /*
    * Switch da song
  */
  switchSong() {
    var options = {
      url: "https://api.spotify.com/v1/me/player/next",
      method: "POST",
      headers: {
        Authorization: `${this.token.tokenType} ${this.token.accessToken}`,
        Accept: "application/json"
      },
      timeout: 10000
    }

    return new Promise((res, rej) => {
      request(options, (err, response, body) => {
        if (err) throw err;
        
        if (Math.floor(response.statusCode / 100) == 2) {
          res({ success: true })
        } else {
          reject(response.statusCode)
        }
      })
    })
  }

  /*
    * Search for a song
  */
  search(song, isTrack=true) {
    var options = {
      url: `https://api.spotify.com/v1/search?query=${encodeURIComponent(song)}&type=${isTrack ? "track" : "artist"}`,
      method: "GET",
      headers: {
        Authorization: `${this.token.tokenType} ${this.token.accessToken}`,
        'Accept': "application/json"
      },
      timeout: 10000
    }

    return new Promise((resolve, reject) => {
      request(options, (err, response, body) => {
        if (err) throw err;

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) { reject("Error while parsing body."); return; }

        if (response.statusCode === 200) {
          resolve(parsed.tracks.items)
        } else {
          reject("Error while getting song. Response Code:", response.statusCode, ", Error MSG:", parsed.error.message)
        }
      })
    })
  }

	/*
	* A function to return the current song data.
	*/
  getCurrentSongPlaying() {
    return this.currentlyPlaying;
  }

  hasBlockedSong(id) {
    for (let blockedSong of this.blockedSongs) {
      if (blockedSong.id == id) return true;
    }
    return false;
  }
}

//Empty Promise
function ep() {
	return new Promise((r, rj) => {r(null)})
}

/*
  * Spotify Data contains: authCode, authHeader, REDIRECT_URI, state
*/
async function createNewRequest(spotifyData) {
  let token = await getToken(spotifyData);
  let spotifyReq = new SpotifyRequest(spotifyData, token, spotifyData.authorizationCode, spotifyData.state);
  
  spotifyReq.blockedSongs = spotifyData.blocked;
  
  return spotifyReq;
}

module.exports = {
  getAuthHeader,
  getToken,
  createNewRequest,
}
