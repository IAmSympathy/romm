(function () {
  console.log('[NETPLAY AUDIO FIX] Initializing audio fix & Volume Persistence...');

  // Read saved volume from localStorage
  var savedVolStr = localStorage.getItem('romm_saved_volume');
  if (savedVolStr === null) {
    savedVolStr = localStorage.getItem('volume');
  }
  var initVol = (savedVolStr !== null && !isNaN(parseFloat(savedVolStr))) ? parseFloat(savedVolStr) : 1.0;
  window.__ejsCurrentVolume = initVol;

  // 1. Install Persistent Audio Tap & Master Volume Gain Node on AudioNode.prototype.connect
  function installAudioTap() {
    if (window.__ejsNetplayAudioTapInstalled) return;
    window.__ejsNetplayAudioTapInstalled = true;

    var tap = (window.__ejsNetplayAudioTap = {
      caps: new WeakMap(),
      last: null,
    });
    var origConnect = AudioNode.prototype.connect;

    AudioNode.prototype.connect = function (target) {
      try {
        var ctx = this.context;
        if (ctx && target === ctx.destination) {
          tap.last = ctx;

          // Read current saved volume
          var curVolStr = localStorage.getItem('romm_saved_volume');
          var currentVol = (curVolStr !== null && !isNaN(parseFloat(curVolStr))) ? parseFloat(curVolStr) : window.__ejsCurrentVolume;

          // Initialize Master Volume GainNode if not present
          if (!ctx.__masterVolumeGain) {
            var masterGain = ctx.createGain();
            masterGain.gain.value = currentVol;
            origConnect.call(masterGain, ctx.destination);
            ctx.__masterVolumeGain = masterGain;
            console.log('[VOLUME FIX] Master Volume GainNode initialized on AudioContext with saved volume:', currentVol);
          } else {
            ctx.__masterVolumeGain.gain.value = currentVol;
          }

          // Create capture destination for Netplay host streaming
          var cap = tap.caps.get(ctx);
          if (!cap) {
            cap = ctx.createMediaStreamDestination();
            tap.caps.set(ctx, cap);
          }
          origConnect.call(this, cap); // Fork to Netplay capture node

          // Route playback audio through Master Volume GainNode
          return origConnect.call(this, ctx.__masterVolumeGain);
        }
      } catch (e) {
        console.error('[NETPLAY AUDIO FIX] Error in AudioNode.connect tap:', e);
      }
      return origConnect.apply(this, arguments);
    };
    console.log('[NETPLAY AUDIO FIX] Audio tap and Master Volume control installed on AudioNode.prototype.connect.');
  }

  installAudioTap();

  // 2. Global Volume Control Function
  window.__setEjsGlobalVolume = function (vol) {
    vol = Math.max(0, Math.min(1, parseFloat(vol)));
    window.__ejsCurrentVolume = vol;

    try {
      localStorage.setItem('romm_saved_volume', vol.toString());
      localStorage.setItem('volume', vol.toString());
    } catch (e) {}

    // A. Update Master Gain Node on active AudioContext
    if (window.__ejsNetplayAudioTap && window.__ejsNetplayAudioTap.last) {
      var ctx = window.__ejsNetplayAudioTap.last;
      if (ctx.__masterVolumeGain) {
        ctx.__masterVolumeGain.gain.value = vol;
      }
    }

    // B. Update OpenAL sources if present
    if (
      window.EJS_emulator &&
      window.EJS_emulator.Module &&
      window.EJS_emulator.Module.AL &&
      window.EJS_emulator.Module.AL.currentCtx &&
      window.EJS_emulator.Module.AL.currentCtx.sources
    ) {
      window.EJS_emulator.Module.AL.currentCtx.sources.forEach(function (s) {
        if (s && s.gain && s.gain.gain) {
          s.gain.gain.value = vol;
        }
      });
    }

    // C. Update EJS_emulator internal volume property
    if (window.EJS_emulator) {
      window.EJS_emulator.volume = vol;
    }
  };

  // 3. Patch _captureHostAudio on EmulatorJS Netplay instance
  function patchCaptureHostAudio(netplay) {
    if (!netplay || netplay.__netplayAudioFixed) return;
    netplay.__netplayAudioFixed = true;

    netplay._captureHostAudio = function () {
      try {
        var tap = window.__ejsNetplayAudioTap;
        var ctx =
          (tap && tap.last) ||
          (this.emu && this.emu.Module && this.emu.Module.AL && this.emu.Module.AL.currentCtx && this.emu.Module.AL.currentCtx.audioCtx) ||
          (this.emu && this.emu.gameManager && this.emu.gameManager.audioContext);

        if (!ctx) {
          console.warn('[NETPLAY HOST FIX] No audio context found for capture');
          return null;
        }

        if (ctx.state !== 'running') {
          ctx.resume().catch(function () {});
        }

        var cap = tap && tap.caps.get(ctx);
        if (!cap) {
          cap = ctx.createMediaStreamDestination();
          if (tap) tap.caps.set(ctx, cap);
        }

        this._hostAudioDest = cap;
        var stream = cap.stream;
        var tracks = stream ? stream.getAudioTracks() : [];
        console.log(
          '[NETPLAY HOST FIX] Captured host audio stream with ' + tracks.length + ' audio track(s)'
        );
        return tracks.length ? stream : null;
      } catch (e) {
        console.error('[NETPLAY HOST FIX] _captureHostAudio error:', e);
        return null;
      }
    };
    console.log('[NETPLAY AUDIO FIX] _captureHostAudio successfully patched on Netplay instance.');
  }

  // Intercept window.EJS_emulator property assignment
  var _emulator = window.EJS_emulator;

  function tryPatchEmulator(emu) {
    if (emu && emu.netplay) {
      patchCaptureHostAudio(emu.netplay);
    }
  }

  if (_emulator) {
    tryPatchEmulator(_emulator);
  }

  try {
    Object.defineProperty(window, 'EJS_emulator', {
      get: function () {
        return _emulator;
      },
      set: function (emu) {
        _emulator = emu;
        tryPatchEmulator(emu);
      },
      configurable: true,
      enumerable: true,
    });
  } catch (e) {
    console.warn('[NETPLAY AUDIO FIX] Could not defineProperty on window.EJS_emulator:', e);
  }

  // Periodic fallback check & volume enforcement loop
  setInterval(function () {
    if (window.EJS_emulator && window.EJS_emulator.netplay) {
      patchCaptureHostAudio(window.EJS_emulator.netplay);
    }

    var curSaved = parseFloat(localStorage.getItem('romm_saved_volume') || window.__ejsCurrentVolume || '1.0');

    // Enforce gain on active AudioContext
    if (window.__ejsNetplayAudioTap && window.__ejsNetplayAudioTap.last) {
      var ctx = window.__ejsNetplayAudioTap.last;
      if (ctx.__masterVolumeGain && Math.abs(ctx.__masterVolumeGain.gain.value - curSaved) > 0.001) {
        ctx.__masterVolumeGain.gain.value = curSaved;
      }
    }

    // Synchronize Volume Sliders in DOM
    var volSliders = document.querySelectorAll('input[data-range="volume"], .ejs_volume_parent input[type="range"]');
    volSliders.forEach(function (slider) {
      if (!slider.dataset.volumeFixed) {
        slider.dataset.volumeFixed = 'true';
        slider.value = curSaved;

        var updateVol = function () {
          var val = parseFloat(slider.value);
          window.__setEjsGlobalVolume(val);
        };

        ['input', 'change', 'mousemove', 'touchmove', 'mouseup', 'touchend'].forEach(function (evt) {
          slider.addEventListener(evt, updateVol, { passive: true });
        });
      } else if (!document.activeElement || document.activeElement !== slider) {
        if (Math.abs(parseFloat(slider.value) - curSaved) > 0.01) {
          slider.value = curSaved;
        }
      }
    });
  }, 200);

  // Guest-side safety net
  var resumeGuestAudio = function () {
    try {
      if (window.__ejsNetplayAudioTap && window.__ejsNetplayAudioTap.last) {
        var lastCtx = window.__ejsNetplayAudioTap.last;
        if (lastCtx.state === 'suspended') {
          lastCtx.resume().catch(function () {});
        }
      }
      if (
        window.EJS_emulator &&
        window.EJS_emulator.netplay &&
        window.EJS_emulator.netplay._remoteAudioCtx
      ) {
        var remoteCtx = window.EJS_emulator.netplay._remoteAudioCtx;
        if (remoteCtx.state === 'suspended') {
          remoteCtx.resume().catch(function () {});
        }
      }
      document.querySelectorAll('audio[id^="ejs-remote-audio-"]').forEach(function (audioEl) {
        if (audioEl.paused) {
          audioEl.play().catch(function () {});
        }
      });
    } catch (e) {}
  };

  ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(function (eventType) {
    window.addEventListener(eventType, resumeGuestAudio, { capture: true, passive: true });
  });

})();
