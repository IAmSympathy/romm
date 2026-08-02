(function () {
  'use strict';
  console.log('[ROMM CUSTOM UI] Initializing Clean Arcade Master High Score & Active Sessions Engine (v230)...');

  // Force platform groupBy to 'generation' for all users (overrides stale localStorage value)
  (function migrateLocalStorage() {
    var groupByKey = 'v2.gallery.groupBy';
    var current = localStorage.getItem(groupByKey);
    if (current === null || current === 'none' || current === '') {
      localStorage.setItem(groupByKey, 'generation');
    }
  })();

  // Inject Consolidated & Optimized Custom CSS
  function injectCustomStyles() {
    if (document.getElementById('romm-custom-ui-styles')) return;
    var styleEl = document.createElement('style');
    styleEl.id = 'romm-custom-ui-styles';
    styleEl.textContent = `
      /* ========================================================= */
      
      
      
      
      
      /* Fix flex stretching & gap in Random Pick Info Block */
      .r-v2-widget-pick__body {
        align-items: center !important;
      }
      .r-v2-widget-pick__info {
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-self: center !important;
        height: auto !important;
        gap: 4px !important;
        flex: 1 !important;
      }
      .r-v2-widget-pick__name {
        min-height: 0 !important;
        height: auto !important;
        margin: 0 !important;
      }
      .r-v2-widget-pick__footer {
        margin-top: 2px !important;
      }

      /* Remove RomM margin-top: auto void gap */
      .r-v2-widget-pick__meta,
      .r-v2-widget-pick__footer,
      .r-v2-widget-pick__platform {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      .r-v2-widget-pick__info {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        gap: 3px !important;
      }

      /* Dynamic Auto-Height for Game Title (No empty dead space for 1-line titles) */
      .r-v2-widget-pick__name {
        min-height: 0 !important;
        height: auto !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 2 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
        margin-bottom: 2px !important;
      }

      /* Horizontal Inline Row for Platform & Year/Region in Random Pick Widget */
      .r-v2-widget-pick__footer {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: center !important;
        flex-wrap: wrap !important;
        gap: 4px 6px !important;
        margin-top: 4px !important;
      }
      .r-v2-widget-pick__platform,
      .r-v2-widget-pick__meta {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 4px !important;
        margin: 0 !important;
      }
      .r-v2-widget-pick__platform::after {
        content: "•" !important;
        margin-left: 6px !important;
        color: rgba(255, 255, 255, 0.4) !important;
        font-weight: bold !important;
        font-size: 11px !important;
      }
      .r-v2-widget-pick__info {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
        gap: 4px !important;
      }

      
      /* Subtler & Faster Spring Reroll Dice Spin Animation */
      @keyframes spring-dice-spin {
        0% { transform: rotate(0deg) scale(1); }
        50% { transform: rotate(180deg) scale(1.15); }
        100% { transform: rotate(360deg) scale(1); }
      }
      .r-v2-widget-pick__reroll.is-spinning .v-icon,
      .r-v2-widget-pick__reroll.is-spinning .r-btn__icon,
      .r-v2-widget-pick__reroll.is-spinning svg,
      .r-v2-widget-pick__reroll.is-spinning i {
        animation: spring-dice-spin 0.3s ease-out forwards !important;
      }

      /* Single Pulse Pop Card Animation (Enlargement & Shrinking, No Re-bounce) */
      @keyframes spring-card-bounce {
        0% { transform: scale(0.98); opacity: 0.9; }
        50% { transform: scale(1.025); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      .r-v2-widget-pick__body.is-bouncing {
        animation: spring-card-bounce 0.2s ease-out forwards !important;
      }

      /* Clean 2-Column Grid Layout for Library Stats Widget */
      .r-v2-widget-lib__stats,
      .r-v2-widget-lib__stats--multi-col {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(110px, 1fr)) !important;
        gap: 4px 10px !important;
        width: 100% !important;
        padding: 2px 0 !important;
      }
      .r-v2-widget-lib__row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 6px !important;
        padding: 3px 0 !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
        font-size: 11.5px !important;
      }
      .r-v2-widget:has(.r-v2-widget-lib__stats) {
        width: 295px !important;
        min-width: 295px !important;
        max-width: 295px !important;
      }

      /* 1. HERO & WIDGET CARDS (UNIFORM & EXPANDED 440PX SESSIONS)*/
      /* ========================================================= */
      .r-v2-widget--hero-pick,
      .r-v2-widget--hero-stats,
      .r-v2-widget:has(.r-v2-widget-pick__body),
      .r-v2-widget:has(.r-v2-widget-pick__empty),
      .r-v2-widget:has(.r-v2-widget-lib__stats) {
        width: 320px !important;
        height: 300px !important;
        min-height: 300px !important;
        max-height: 300px !important;
        overflow: hidden !important;
        padding: 14px 16px !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-items: flex-start !important;
        box-shadow: none !important;
        border: 1px solid var(--r-color-border, rgba(255, 255, 255, 0.12)) !important;
        border-radius: 12px !important;
      }
      .r-v2-widget__title {
        align-self: flex-start !important;
        text-align: left !important;
        width: auto !important;
        margin-bottom: 4px !important;
      }

      /* EXPANDED 490PX WIDE ACTIVE SESSIONS WIDGET */
      .r-v2-widget--hero-sessions,
      #romm-custom-active-sessions-widget {
        width: 490px !important;
        min-width: 490px !important;
        max-width: 490px !important;
        height: 300px !important;
        min-height: 300px !important;
        max-height: 300px !important;
        overflow: hidden !important;
        padding: 12px 16px 10px 16px !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        box-shadow: none !important;
        border: 1px solid var(--r-color-border, rgba(255, 255, 255, 0.12)) !important;
        border-radius: 12px !important;
        background: var(--r-color-surface, rgba(20, 20, 32, 0.85)) !important;
      }

      /* Random Pick Cover & Text */
      .r-v2-widget-pick__body {
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100% !important;
        height: 100% !important;
        margin-top: 6px !important;
        overflow: visible !important;
      }

      .r-v2-widget-pick__body .r-v2-widget-pick__cover,
      .r-v2-widget-pick__body .r-v2-widget-pick__cover img {
        height: auto !important;
        max-height: 162px !important;
        min-height: 135px !important;
        width: auto !important;
        max-width: 100% !important;
        flex: 1 1 auto !important;
        object-fit: contain !important;
        opacity: 1 !important;
        filter: none !important;
        box-shadow: none !important;
      }

      .r-v2-widget-pick__info {
        width: 100% !important;
        align-items: center !important;
        text-align: center !important;
        gap: 4px !important;
        flex-shrink: 0 !important;
        overflow: visible !important;
      }

      .r-v2-widget-pick__name {
        font-size: 13px !important;
        font-weight: 600 !important;
        line-height: 1.25 !important;
        text-align: center !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: 34px !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 2 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        word-break: break-word !important;
        margin: 0 !important;
      }

      /* Widget Action Buttons */
      .r-v2-widget-pick__actions {
        width: 100% !important;
        justify-content: center !important;
        gap: 8px !important;
        margin: 0 !important;
        padding: 0 !important;
        flex-shrink: 0 !important;
      }

      .r-v2-widget-pick__actions button,
      .r-v2-widget-pick__actions .v-btn {
        border-radius: 8px !important;
        text-transform: none !important;
        letter-spacing: normal !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        height: 34px !important;
        min-height: 34px !important;
        padding: 0 14px !important;
        box-sizing: border-box !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: var(--r-color-surface-hover, rgba(255, 255, 255, 0.08)) !important;
        border: 1px solid var(--r-color-border, rgba(255, 255, 255, 0.15)) !important;
        color: var(--r-color-fg, #ffffff) !important;
        box-shadow: none !important;
      }

      .r-v2-widget-pick__actions button:last-child,
      .r-v2-widget-pick__actions .v-btn:last-child {
        width: 38px !important;
        min-width: 38px !important;
        max-width: 38px !important;
        padding: 0 !important;
      }

      /* Library Stats 1-Column Full Width Layout */
      .r-v2-widget-lib__stats {
        display: flex !important;
        flex-direction: column !important;
        gap: 5px !important;
        width: 100% !important;
        height: calc(100% - 24px) !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }

      .r-v2-widget-lib__row {
        font-size: 13px !important;
        padding: 5px 10px !important;
        background: var(--r-color-surface, rgba(255, 255, 255, 0.05)) !important;
        border-radius: 8px !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        width: 100% !important;
        box-sizing: border-box !important;
        border: 1px solid rgba(255, 255, 255, 0.06) !important;
      }

      .r-v2-widget-lib__label {
        font-size: 12.5px !important;
        font-weight: 500 !important;
        color: #cbd5e1 !important;
        white-space: nowrap !important;
        overflow: visible !important;
        text-overflow: clip !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
      }

      .r-v2-widget-lib__label i,
      .r-v2-widget-lib__label .v-icon,
      .r-v2-widget-lib__label svg {
        font-size: 14px !important;
        color: #a78bfa !important;
      }

      .r-v2-widget-lib__val {
        font-size: 13px !important;
        font-weight: 700 !important;
        color: #ffffff !important;
        white-space: nowrap !important;
      }

      /* ========================================================= */
      /* 2. ROMM V5 PLATFORM GAME GALLERY – FULL WIDTH SCROLLER    */
      /* Only ensures the scroller uses full available width.       */
      /* Card sizing left to RomM's native virtual scroller.        */
      /* ========================================================= */

      /* Full-width scroller so the virtual scroller calculates correct columns */
      body.r-v2-platform-active .r-v2-shell__scroller {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Ensure content containers also use full available width */
      body.r-v2-platform-active .r-v2-shell__header,
      body.r-v2-platform-active .r-v2-shell__toolbar,
      body.r-v2-platform-active .r-v2-shell__row {
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      /* ========================================================= */
      /* 3. ACTIVE SESSIONS WIDGET & UNIFIED SUBTLE BREATHING DOTS */
      /* ========================================================= */
      
      /* ROMM V5 NATIVE WIDGET HEADER MATCH (EXACT MATCH TO STATISTIQUES DE LA BIBLIOTHÈQUE) */
      .r-v2-widget--hero-sessions .r-v2-widget__header,
      #romm-custom-active-sessions-widget .r-v2-widget__header,
      .romm-custom-widget-title {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        width: 100% !important;
        margin-bottom: 12px !important;
        padding-bottom: 0 !important;
        border-bottom: none !important;
        flex-shrink: 0 !important;
      }

      .r-v2-widget--hero-sessions .r-v2-widget__title,
      #romm-custom-active-sessions-widget .r-v2-widget__title {
        font-size: 11px !important;
        font-weight: 700 !important;
        color: var(--r-color-fg-secondary, #94a3b8) !important;
        display: flex !important;
        align-items: center !important;
        letter-spacing: 0.08em !important;
        text-transform: uppercase !important;
      }

      .r-v2-widget--hero-sessions .r-v2-widget__subtitle,
      #romm-custom-active-sessions-widget .r-v2-widget__subtitle,
      .romm-custom-widget-count {
        font-size: 11px !important;
        font-weight: 600 !important;
        color: var(--r-color-fg-secondary, #64748b) !important;
        background: none !important;
        border: none !important;
        padding: 0 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
      }

      .romm-custom-sessions-list {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        overflow-y: auto !important;
        flex: 1 1 auto !important;
        padding-right: 2px !important;
      }

      .romm-custom-sessions-list::-webkit-scrollbar {
        width: 4px !important;
      }

      .romm-custom-sessions-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2) !important;
        border-radius: 4px !important;
      }

      /* ACTIVE GAME PLAYER & ONLINE BROWSING CARD (UNIFIED DUAL-COLUMN GRID) */
      .romm-custom-session-card {
        background: rgba(255, 255, 255, 0.04) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 10px !important;
        padding: 9px 12px !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        transition: background 0.15s ease, border-color 0.15s ease !important;
        overflow: visible !important;
        box-sizing: border-box !important;
        min-height: 78px !important;
        height: auto !important;
      }

      .romm-custom-session-card[data-rom-id]:not([data-rom-id="0"]):hover {
        background: rgba(167, 139, 250, 0.12) !important;
        border-color: rgba(167, 139, 250, 0.35) !important;
      }

      /* FAR-LEFT USER AVATAR COVER (44PX CIRCLE WITH PURPLE RING) */
      .romm-custom-session-avatar-cover {
        width: 44px !important;
        height: 44px !important;
        min-width: 44px !important;
        min-height: 44px !important;
        border-radius: 50% !important;
        background: linear-gradient(135deg, #7c3aed, #4c1d95) !important;
        color: #ffffff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-weight: 700 !important;
        font-size: 16px !important;
        flex-shrink: 0 !important;
        overflow: hidden !important;
        border: 2px solid rgba(167, 139, 250, 0.5) !important;
        box-shadow: 0 0 10px rgba(124, 58, 237, 0.35) !important;
        align-self: center !important;
      }

      .romm-custom-session-avatar-cover img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border: none !important;
        box-shadow: none !important;
      }

      .romm-custom-session-info {
        flex: 1 1 auto !important;
        overflow: visible !important;
        min-width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 3px !important;
        justify-content: center !important;
      }

      .romm-custom-session-user {
        font-size: 12.5px !important;
        font-weight: 600 !important;
        color: #a78bfa !important;
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
        width: fit-content !important;
        overflow: visible !important;
        text-transform: none !important;
      }

      /* GAME ROW WITH THUMBNAIL COVER (FLEXIBLE ASPECT RATIO FOR HORIZONTAL N64 / SNES COVERS) */
      .romm-custom-session-game-row {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin-top: 1px !important;
      }

      .romm-custom-session-game-cover {
        width: auto !important;
        height: 38px !important;
        min-width: 26px !important;
        max-width: 52px !important;
        border-radius: 5px !important;
        flex-shrink: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: transparent !important;
      }

      .romm-custom-session-game-cover img {
        max-width: 52px !important;
        max-height: 38px !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        border-radius: 5px !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35) !important;
        display: block !important;
        margin: auto !important;
      }

      .romm-custom-session-game-details {
        display: flex !important;
        flex-direction: column !important;
        gap: 1px !important;
        min-width: 0 !important;
        flex: 1 1 auto !important;
      }

      /* UNIFIED MASTER GREEN ONLINE DOT - DISPLAYED EXCLUSIVELY WHEN PLAYING A GAME */
      .romm-online-dot,
      .romm-custom-toast-online-dot,
      .romm-custom-widget-online-dot,
      .romm-card-title-online-dot {
        width: 7px !important;
        height: 7px !important;
        min-width: 7px !important;
        min-height: 7px !important;
        max-width: 7px !important;
        max-height: 7px !important;
        border-radius: 50% !important;
        background: #22c55e !important;
        display: inline-block !important;
        margin-left: 4px !important;
        vertical-align: middle !important;
        flex-shrink: 0 !important;
        animation: subtleBreathing 2.0s infinite ease-in-out !important;
      }

      @keyframes subtleBreathing {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 3px 0.5px rgba(34, 197, 94, 0.4);
        }
        50% {
          transform: scale(1.08);
          box-shadow: 0 0 5px 1px rgba(34, 197, 94, 0.75);
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 3px 0.5px rgba(34, 197, 94, 0.4);
        }
      }

      .romm-custom-session-game {
        font-size: 12.5px !important;
        font-weight: 700 !important;
        color: #ffffff !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        line-height: 1.3 !important;
        max-width: 100% !important;
      }

      /* CLEAN MUTED TEXT FOR ONLINE BROWSING STATUS (NO BUBBLE, NO EMOJI) */
      .romm-custom-session-online-text {
        font-size: 11.5px !important;
        font-weight: 500 !important;
        color: #94a3b8 !important;
        margin-top: 1px !important;
        white-space: nowrap !important;
      }

      /* MATCHING PILL / BUBBLE BADGE FOR PLATFORM NAME IN WIDGET */
      .romm-custom-session-plat {
        display: inline-flex !important;
        align-items: center !important;
        width: fit-content !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        color: #cbd5e1 !important;
        background: rgba(255, 255, 255, 0.08) !important;
        padding: 1px 7px !important;
        border-radius: 5px !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        margin-top: 1px !important;
      }

      .romm-custom-sessions-empty {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        height: 100% !important;
        color: #94a3b8 !important;
        font-size: 12.5px !important;
        gap: 6px !important;
        text-align: center !important;
      }

      /* Clean Semi-Transparent Toast Container */
      .romm-custom-toast-container {
        position: fixed !important;
        top: 28px !important;
        right: 28px !important;
        z-index: 2147483647 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
        pointer-events: none !important;
      }

      /* SEMI-TRANSPARENT GLASS TOAST (MATCHING SESSIONS DE JEU WIDGET PLAQUE LAYOUT) */
      .romm-custom-toast {
        pointer-events: auto !important;
        position: relative !important;
        width: 440px !important;
        min-width: 440px !important;
        max-width: 440px !important;
        background: rgba(18, 18, 30, 0.88) !important;
        backdrop-filter: blur(20px) saturate(190%) !important;
        -webkit-backdrop-filter: blur(20px) saturate(190%) !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        border-radius: 12px !important;
        padding: 11px 14px !important;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55) !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 12px !important;
        color: #ffffff !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        transition: opacity 0.2s ease, transform 0.2s ease, background 0.2s ease !important;
        animation: fadeInToast 0.25s ease-out !important;
      }

      .romm-custom-toast:hover {
        background: rgba(26, 26, 42, 0.95) !important;
        border-color: rgba(167, 139, 250, 0.4) !important;
      }

      /* ABSOLUTE PINNED CLOSE BUTTON (TOP RIGHT OF NOTIFICATION) */
      .romm-toast-close-btn {
        position: absolute !important;
        top: 10px !important;
        right: 12px !important;
        width: 22px !important;
        height: 22px !important;
        min-width: 22px !important;
        min-height: 22px !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        color: #94a3b8 !important;
        font-size: 11px !important;
        font-weight: bold !important;
        cursor: pointer !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex-shrink: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        z-index: 10 !important;
        transition: background 0.15s ease, color 0.15s ease !important;
      }

      .romm-toast-close-btn:hover {
        background: rgba(255, 255, 255, 0.22) !important;
        color: #ffffff !important;
      }

      @keyframes fadeInToast {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* ========================================================= */
      /* 4. TELEPORTED DOM PORTAL 3D BOXART & BACKDROP (Z-INDEX)   */
      /* ========================================================= */
      
      /* BACKDROP OVERLAY ATTACHED DIRECTLY TO BODY AT Z-INDEX 999998 */
      #romm-boxart-zoom-backdrop {
        position: fixed !important;
        inset: 0 !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.75) !important;
        backdrop-filter: blur(14px) saturate(150%) !important;
        -webkit-backdrop-filter: blur(14px) saturate(150%) !important;
        z-index: 999998 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.38s ease !important;
      }

      #romm-boxart-zoom-backdrop.active {
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      /* TELEPORTED ZOOMED COVER FLOATS DIRECTLY ON BODY AT Z-INDEX 999999 (ABOVE BACKDROP) */
      .romm-boxart-teleported {
        position: fixed !important;
        z-index: 2147483647 !important;
        transform: translate(0px, 0px) scale(1.0) !important;
        transition: transform 0.38s cubic-bezier(0.22, 1.1, 0.36, 1) !important;
        overflow: visible !important;
        pointer-events: auto !important;
        cursor: grab !important;
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        filter: none !important;
        -webkit-filter: none !important;
      }

      .romm-boxart-zoomed {
        transform: translate(var(--zoom-shift-x, 0px), var(--zoom-shift-y, 0px)) scale(1.82) !important;
        transition: transform 0.38s cubic-bezier(0.22, 1.1, 0.36, 1) !important;
      }

      .romm-boxart-teleported *,
      .romm-boxart-teleported .r-v2-det-cover__art,
      .romm-boxart-teleported .r-v2-det-cover__box3d,
      .romm-boxart-teleported canvas,
      .romm-boxart-teleported img {
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        filter: none !important;
        -webkit-filter: none !important;
      }

      /* INVERSE UNZOOM ANIMATION WITH MATCHING ELEGANT REDUCED-BOUNCE TRANSITION */
      .romm-boxart-unzooming {
        transform: translate(0px, 0px) scale(1.0) !important;
        transition: transform 0.38s cubic-bezier(0.22, 1.1, 0.36, 1) !important;
      }

      .romm-boxart-zoomed:active {
        cursor: grabbing !important;
      }

      /* ========================================================= */
      /* 5. STRICT DISPLAY SAFETY: HIDE HIDDEN POPUPS              */
      /* ========================================================= */

      div#game .ejs_popup_container[style*="display: none"],
      div#game .ejs_popup_container[style*="display:none"],
      div#game .ejs_popup_container[hidden],
      div#game .ejs_popup_body > div[style*="display: none"],
      div#game .ejs_popup_body > div[style*="display:none"],
      div#game .ejs_popup_body > div[hidden],
      div#game [hidden] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      /* ========================================================= */
      /* 6. DYNAMIC MICA POPUP CARD (OUTER MAIN POPUP CARDS)       */
      /* ========================================================= */

      div#game .ejs_popup_container:not(.ejs_popup_container_box):not(.ejs_popup_container .ejs_popup_container):not([style*="display: none"]):not([style*="display:none"]):not([hidden]) {
        display: flex !important;
        flex-direction: column !important;
        background: rgba(20, 20, 32, 0.92) !important;
        backdrop-filter: blur(18px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(18px) saturate(180%) !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-radius: 16px !important;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7) !important;
        color: #ffffff !important;
        font-family: inherit !important;
        padding: 24px 28px !important;
        min-width: 520px !important;
        max-width: 720px !important;
        width: auto !important;
        height: auto !important;
        max-height: 85vh !important;
        box-sizing: border-box !important;
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        z-index: 99999 !important;
        overflow: hidden !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }

      div#game .ejs_popup_container:has(.ejs_popup_container_box) {
        min-height: 460px !important;
        min-width: 520px !important;
      }

      div#game .ejs_popup_container > h4 {
        color: #ffffff !important;
        font-size: 20px !important;
        font-weight: 700 !important;
        margin: 0 0 14px 0 !important;
        padding-bottom: 10px !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12) !important;
        text-align: center !important;
        flex-shrink: 0 !important;
      }

      div#game .ejs_popup_body,
      div#game .ejs_control_body {
        width: 100% !important;
        height: auto !important;
        max-height: calc(85vh - 70px) !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        box-sizing: border-box !important;
        padding-right: 4px !important;
        flex: 1 1 auto !important;
      }

      div#game .ejs_popup_container::-webkit-scrollbar,
      div#game .ejs_popup_body::-webkit-scrollbar,
      div#game .ejs_control_body::-webkit-scrollbar,
      div#game .ejs_popup_container_box::-webkit-scrollbar {
        width: 6px !important;
      }

      div#game .ejs_popup_container::-webkit-scrollbar-thumb,
      div#game .ejs_popup_body::-webkit-scrollbar-thumb,
      div#game .ejs_control_body::-webkit-scrollbar-thumb,
      div#game .ejs_popup_container_box::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.25) !important;
        border-radius: 4px !important;
      }

      div#game .ejs_popup_container::-webkit-scrollbar-track,
      div#game .ejs_popup_body::-webkit-scrollbar-track,
      div#game .ejs_control_body::-webkit-scrollbar-track {
        background: transparent !important;
      }

      div#game .ejs_popup_body > div:first-child:not([style*="display: none"]):not([style*="display:none"]) {
        width: 100% !important;
        max-height: 320px !important;
        overflow-y: auto !important;
      }

      div#game .ejs_popup_container > a.ejs_button:not(.ejs_close_icon):not(.ejs_hidden_btn),
      div#game a.ejs_button:not(.ejs_close_icon):not(.ejs_hidden_btn),
      div#game .ejs_popup_submit:not(.ejs_hidden_btn),
      div#game .ejs_button_button:not(.ejs_subpopup_close_btn):not(.ejs_hidden_btn),
      div#game .ejs_netplay_join_button:not(.ejs_hidden_btn) {
        background: #7c3aed !important;
        color: #ffffff !important;
        border: none !important;
        border-radius: 8px !important;
        font-weight: 600 !important;
        font-size: 13.5px !important;
        padding: 10px 22px !important;
        cursor: pointer !important;
        text-decoration: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin: 14px 10px 4px 0 !important;
        box-shadow: none !important;
        transition: background-color 0.15s ease !important;
      }

      div#game .ejs_popup_container > a.ejs_button:not(.ejs_close_icon):not(.ejs_hidden_btn):hover,
      div#game a.ejs_button:not(.ejs_close_icon):not(.ejs_hidden_btn):hover,
      div#game .ejs_popup_submit:not(.ejs_hidden_btn):hover,
      div#game .ejs_button_button:not(.ejs_subpopup_close_btn):not(.ejs_hidden_btn):hover,
      div#game .ejs_netplay_join_button:hover {
        background: #6d28d9 !important;
        box-shadow: none !important;
      }

      div#game .ejs_popup_container > a.ejs_button.ejs_close_icon,
      div#game .ejs_popup_container > a.ejs_close_icon,
      div#game .ejs_popup_container_box a.ejs_close_icon,
      div#game .ejs_cheat_parent a.ejs_close_icon,
      div#game .ejs_subpopup_close_icon {
        position: absolute !important;
        top: 16px !important;
        right: 16px !important;
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        min-height: 32px !important;
        padding: 0 !important;
        margin: 0 !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.08) !important;
        color: #94a3b8 !important;
        font-size: 16px !important;
        font-weight: bold !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        box-shadow: none !important;
        cursor: pointer !important;
        text-decoration: none !important;
        transition: background 0.15s ease, color 0.15s ease !important;
        z-index: 100001 !important;
      }

      div#game .ejs_popup_container > a.ejs_button.ejs_close_icon:hover,
      div#game .ejs_popup_container > a.ejs_close_icon:hover,
      div#game .ejs_popup_container_box a.ejs_close_icon:hover,
      div#game .ejs_cheat_parent a.ejs_close_icon:hover,
      div#game .ejs_subpopup_close_icon:hover {
        background: rgba(255, 255, 255, 0.18) !important;
        color: #ffffff !important;
      }

      .ejs_hidden_btn,
      div#game .ejs_popup_container_box button.ejs_hidden_btn,
      div#game .ejs_cheat_parent button.ejs_hidden_btn,
      div#game .ejs_popup_container_box button:not(.ejs_popup_submit),
      div#game .ejs_cheat_parent button:not(.ejs_popup_submit),
      div#game .ejs_popup_container_box button:nth-of-type(2),
      div#game .ejs_cheat_parent button:nth-of-type(2) {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* ========================================================= */
      /* 7. NESTED REBIND KEYBOARD/GAMEPAD PROMPT OVERLAY & BOX    */
      /* ========================================================= */

      div#game .ejs_popup_container .ejs_popup_container:not([hidden]) {
        position: absolute !important;
        inset: 0 !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        transform: none !important;
        background: rgba(10, 10, 18, 0.92) !important;
        backdrop-filter: blur(16px) saturate(180%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
        border-radius: 16px !important;
        border: none !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 100005 !important;
        padding: 0 !important;
        margin: 0 !important;
        box-sizing: border-box !important;
      }

      div#game .ejs_popup_box {
        background: rgba(24, 24, 40, 0.98) !important;
        border: 1px solid rgba(138, 92, 246, 0.5) !important;
        border-radius: 16px !important;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(124, 58, 237, 0.3) !important;
        padding: 36px 44px !important;
        min-width: 400px !important;
        min-height: 200px !important;
        width: auto !important;
        height: auto !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        text-align: center !important;
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        margin: 0 auto !important;
        z-index: 100006 !important;
        color: #ffffff !important;
        box-sizing: border-box !important;
      }

      div#game .ejs_popup_box > div,
      div#game .ejs_popup_box {
        font-size: 17px !important;
        font-weight: 700 !important;
        line-height: 1.6 !important;
        color: #ffffff !important;
        white-space: pre-line !important;
        text-align: center !important;
      }

      div#game .ejs_popup_box a.ejs_control_set_button,
      div#game .ejs_popup_box a.ejs_button,
      div#game .ejs_popup_box button {
        background: rgba(239, 68, 68, 0.25) !important;
        color: #f87171 !important;
        border: 1px solid rgba(239, 68, 68, 0.5) !important;
        border-radius: 8px !important;
        font-weight: 700 !important;
        font-size: 14px !important;
        padding: 10px 28px !important;
        cursor: pointer !important;
        text-decoration: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin-top: 18px !important;
        box-shadow: none !important;
        transition: all 0.15s ease !important;
      }

      div#game .ejs_popup_box a.ejs_control_set_button:hover,
      div#game .ejs_popup_box a.ejs_button:hover,
      div#game .ejs_popup_box button:hover {
        background: rgba(239, 68, 68, 0.45) !important;
        color: #ffffff !important;
      }

      /* ========================================================= */
      /* 8. EMULATORJS MOUSE & TOUCH POINTER ENGINE (DS / DOS)     */
      /* ========================================================= */
      #game,
      #game canvas,
      .ejs_canvas_parent,
      .ejs_canvas_parent canvas {
        pointer-events: auto !important;
        touch-action: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }


    `;
    document.head.appendChild(styleEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCustomStyles);
  } else {
    injectCustomStyles();
  }

  // Cinematic Wheel Engine (Full 3D Interaction, Smooth Reflow Portal Zoom Animation)
  (function initCinematicWheelZoomEngine() {
    // Remove legacy close button if present
    var oldBtn = document.getElementById('romm-boxart-close-btn');
    if (oldBtn) oldBtn.remove();

    function getGlobalBackdrop() {
      var backdrop = document.getElementById('romm-boxart-zoom-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'romm-boxart-zoom-backdrop';
        backdrop.className = 'v-overlay__scrim';
        document.body.appendChild(backdrop);
      }
      return backdrop;
    }

    var isUnzooming = false;

    function zoomBoxart(coverEl) {
      if (!coverEl || isUnzooming) return;

      var mainCover = coverEl.closest('.r-v2-det-cover') || coverEl;
      if (mainCover.classList.contains('romm-boxart-zoomed')) return; // Already zoomed!

      var rect = mainCover.getBoundingClientRect();

      // Create hidden placeholder in original spot to maintain layout structure
      var placeholder = document.getElementById('romm-cover-placeholder');
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.id = 'romm-cover-placeholder';
      }
      placeholder.style.cssText = 'width:' + rect.width + 'px; height:' + rect.height + 'px; visibility:hidden; flex-shrink:0; display:inline-block;';
      mainCover.parentNode.insertBefore(placeholder, mainCover);

      // Lock mainCover at its current screen coordinates BEFORE teleporting
      mainCover.style.position = 'fixed';
      mainCover.style.left = rect.left + 'px';
      mainCover.style.top = rect.top + 'px';
      mainCover.style.width = rect.width + 'px';
      mainCover.style.height = rect.height + 'px';
      mainCover.classList.add('romm-boxart-teleported');

      // Teleport mainCover directly to body to break out of ALL parent stacking contexts
      document.body.appendChild(mainCover);

      // FORCE BROWSER REFLOW so frame 0 (native position scale 1.0) is committed
      void mainCover.offsetWidth;

      // Calculate shift vector to center cover dead-center in viewport
      var boxCenterX = rect.left + rect.width / 2;
      var boxCenterY = rect.top + rect.height / 2;
      var viewportCenterX = window.innerWidth / 2;
      var viewportCenterY = window.innerHeight / 2;

      var shiftX = viewportCenterX - boxCenterX;
      var shiftY = viewportCenterY - boxCenterY;

      // Trigger zoom transition on next animation frame
      requestAnimationFrame(function() {
        mainCover.style.setProperty('--zoom-shift-x', shiftX.toFixed(1) + 'px');
        mainCover.style.setProperty('--zoom-shift-y', shiftY.toFixed(1) + 'px');

        mainCover.classList.remove('romm-boxart-unzooming');
        mainCover.classList.add('romm-boxart-zoomed');
      });

      document.body.classList.add('romm-body-zoomed');

      var backdrop = getGlobalBackdrop();
      backdrop.classList.add('active');

      setTimeout(function() {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }

    function unzoomAll() {
      if (isUnzooming) return;
      var zoomedEl = document.querySelector('.romm-boxart-teleported') || document.querySelector('.romm-boxart-zoomed');
      var backdrop = document.getElementById('romm-boxart-zoom-backdrop');

      if (!zoomedEl && (!backdrop || !backdrop.classList.contains('active'))) return;
      isUnzooming = true;

      // 1. Fade backdrop and trigger inverse animation
      if (backdrop) backdrop.classList.remove('active');
      if (zoomedEl) {
        zoomedEl.classList.remove('romm-boxart-zoomed');
        zoomedEl.classList.add('romm-boxart-unzooming');
      }

      // 2. Wait 380ms for silky reduced-bounce transition to complete
      setTimeout(function() {
        if (zoomedEl) {
          zoomedEl.classList.remove('romm-boxart-teleported');
          zoomedEl.classList.remove('romm-boxart-zoomed');
          zoomedEl.classList.remove('romm-boxart-unzooming');
          zoomedEl.style.removeProperty('--zoom-shift-x');
          zoomedEl.style.removeProperty('--zoom-shift-y');
          zoomedEl.style.removeProperty('position');
          zoomedEl.style.removeProperty('left');
          zoomedEl.style.removeProperty('top');
          zoomedEl.style.removeProperty('width');
          zoomedEl.style.removeProperty('height');

          // Teleport zoomedEl back to original spot in #app
          var placeholder = document.getElementById('romm-cover-placeholder');
          if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(zoomedEl, placeholder);
            placeholder.remove();
          }
        }

        document.body.classList.remove('romm-body-zoomed');
        isUnzooming = false;

        setTimeout(function() {
          window.dispatchEvent(new Event('resize'));
        }, 50);
      }, 380);
    }

    // Capture Phase Wheel Listener (Catches Scroll Down & Prevents Re-Zooming)
    window.addEventListener('wheel', function(e) {
      // CRITICAL: Never intercept events inside EmulatorJS game container (#game)
      if (e.target && (e.target.closest('#game') || e.target.id === 'game')) return;

      var isSingleGamePage = window.location.href.includes('/rom/') || window.location.hash.includes('/rom/');
      if (!isSingleGamePage) return;

      var zoomedEl = document.querySelector('.romm-boxart-zoomed');

      // 1. If ALREADY ZOOMED and user scrolls DOWN -> UNZOOM IMMEDIATELY!
      if (zoomedEl && e.deltaY > 0) {
        e.preventDefault();
        e.stopPropagation();
        unzoomAll();
        return;
      }

      // 2. If ALREADY ZOOMED and user scrolls UP -> IGNORE (PREVENT RE-ZOOMING)
      if (zoomedEl) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 3. Not zoomed yet: check target cover element
      var target = e.target;
      if (!target) return;

      var coverEl = target.closest(
        '.r-v2-det-cover, .r-v2-det-cover__art, .r-v2-det-cover__box3d, .r-v2-rom-hero__art, .r-v2-rom-hero__cover, .r-v2-rom-cover, .r-v2-cover-card'
      );

      if (!coverEl && (target.tagName === 'CANVAS' || target.tagName === 'IMG')) {
        // Only match if the CANVAS/IMG is actually inside a cover art container (NOT EmulatorJS)
        var parentCover = target.closest('.r-v2-det-cover');
        if (parentCover) coverEl = parentCover;
        // Do NOT fall back to target itself — that would hijack the EmulatorJS game canvas
      }

      if (!coverEl) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.deltaY < 0) {
        // Scroll Up -> ZOOM IN
        zoomBoxart(coverEl);
      }
    }, { capture: true, passive: false });

    // Click Listener: UNZOOM IF CLICKED ANYWHERE OUTSIDE THE ZOOMED BOX
    document.addEventListener('click', function(e) {
      // CRITICAL: Never intercept clicks inside EmulatorJS game container (#game)
      if (e.target && (e.target.closest('#game') || e.target.id === 'game')) return;

      var zoomedEl = document.querySelector('.romm-boxart-teleported') || document.querySelector('.romm-boxart-zoomed');
      if (!zoomedEl || isUnzooming) return;

      var isClickInsideBox = zoomedEl.contains(e.target) || e.target === zoomedEl;

      if (!isClickInsideBox) {
        e.preventDefault();
        e.stopPropagation();
        unzoomAll();
      }
    }, true);

    // Escape key to unzoom
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && (document.querySelector('.romm-boxart-zoomed') || document.querySelector('#romm-boxart-zoom-backdrop.active'))) {
        unzoomAll();
      }
    });
  })();

  // Active Sessions & Online Presence Tracking Cache
  var knownActiveSessions = {};
  var isInitialFetch = true;
  var activeSessionsList = [];

  // Multi-Stage Bulletproof Router Navigation Engine
  function navigateToRom(romId) {
    if (!romId || romId === '0' || romId === 0) return;
    console.log('[ROMM NAV] Executing Multi-Stage Navigation for ROM ID:', romId);

    // Stage 1: Try Vue Router instance on #app
    try {
      var appEl = document.querySelector('#app');
      var vueApp = appEl ? (appEl.__vue_app__ || (appEl._vnode && appEl._vnode.component && appEl._vnode.component.proxy)) : null;
      var router = vueApp ? (vueApp.$router || (vueApp.config && vueApp.config.globalProperties && vueApp.config.globalProperties.$router)) : null;
      if (router && typeof router.push === 'function') {
        router.push('/rom/' + romId);
        return;
      }
    } catch (err) {
      console.warn('[ROMM NAV] Vue router push error, falling back to hash/popstate:', err);
    }

    // Stage 2: Hash update + Event dispatch (triggers Vue Router hash listener)
    window.location.hash = '#/rom/' + romId;
    try {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      window.dispatchEvent(new Event('popstate'));
    } catch (e) {}

    // Stage 3: Direct location assignment fallback
    setTimeout(function() {
      if (!window.location.href.includes('/rom/' + romId) && !window.location.hash.includes(romId)) {
        window.location.assign('/#/rom/' + romId);
      }
    }, 100);
  }

  function getAvatarHtml(s, isHeroCover) {
    var userInitial = (s.username || 'U').substring(0, 1).toUpperCase();
    var avatarUrl = null;

    if (s.user_id) {
      avatarUrl = '/api/users/' + s.user_id + '/avatar';
    } else if (s.avatar_path) {
      if (s.avatar_path.startsWith('http://') || s.avatar_path.startsWith('https://') || s.avatar_path.startsWith('/')) {
        avatarUrl = s.avatar_path;
      } else {
        avatarUrl = '/assets/' + s.avatar_path;
      }
    }

    if (isHeroCover) {
      if (avatarUrl) {
        return `<div class="romm-custom-session-avatar-cover"><img src="${avatarUrl}" onerror="this.style.display='none'; this.parentNode.innerHTML='${userInitial}';" /></div>`;
      }
      return `<div class="romm-custom-session-avatar-cover">${userInitial}</div>`;
    }

    if (avatarUrl) {
      return `<div class="romm-custom-session-avatar"><img src="${avatarUrl}" onerror="this.style.display='none'; this.parentNode.innerHTML='${userInitial}';" /></div>`;
    }
    return `<div class="romm-custom-session-avatar">${userInitial}</div>`;
  }

  function getCoverUrl(s) {
    if (!s || !s.rom_cover_path) {
      return s && s.rom_id && s.rom_id > 0 ? '/api/roms/' + s.rom_id + '/cover' : '';
    }
    var p = s.rom_cover_path;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    if (p.startsWith('/assets/romm/resources/')) return p;
    if (p.startsWith('romm/resources/')) return '/assets/' + p;
    if (p.startsWith('roms/')) return '/assets/romm/resources/' + p;
    if (p.startsWith('/')) return p;
    return '/assets/' + p;
  }

  function getToastContainer() {
    var targetParent = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || document.body;
    var container = document.getElementById('romm-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'romm-toast-container';
      container.className = 'romm-custom-toast-container';
      targetParent.appendChild(container);
    } else if (container.parentNode !== targetParent) {
      targetParent.appendChild(container);
    }
    return container;
  }

  function updateToastContainerParent() {
    getToastContainer();
  }

  document.addEventListener('fullscreenchange', updateToastContainerParent);
  document.addEventListener('webkitfullscreenchange', updateToastContainerParent);
  document.addEventListener('mozfullscreenchange', updateToastContainerParent);
  document.addEventListener('MSFullscreenChange', updateToastContainerParent);

  var currentUserId = null;
  var currentUsername = null;

  function getCurrentUser() {
    if (currentUserId !== null && currentUsername !== null) return;
    fetch('/api/users/me')
      .then(function(res) { if (!res.ok) return null; return res.json(); })
      .then(function(u) {
        if (u) {
          if (u.id) currentUserId = u.id;
          if (u.username) currentUsername = u.username.toLowerCase();
        }
      })
      .catch(function() {});
  }

  function showGameLaunchToast(session) {
    if (!session || !session.rom_id || session.rom_id === 0) return; // Toast only for active game launches
    if (currentUserId && session.user_id == currentUserId) return; // Suppress self notifications by ID
    if (currentUsername && session.username && session.username.toLowerCase() === currentUsername) return; // Suppress self notifications by Username

    var container = getToastContainer();
    var toast = document.createElement('div');
    toast.className = 'romm-custom-toast';
    toast.setAttribute('data-rom-id', session.rom_id);
    
    // Exact 1:1 match to Sessions de jeu widget card layout
    var heroAvatarCover = getAvatarHtml(session, true);
    var coverUrl = getCoverUrl(session);
    var coverHtml = coverUrl
      ? `<div class="romm-custom-session-game-cover"><img src="${coverUrl}" onerror="this.style.display='none';" /></div>`
      : `<div class="romm-custom-session-game-cover" style="background: rgba(167, 139, 250, 0.12); border-radius: 5px; border: 1px solid rgba(167, 139, 250, 0.2);"><i class="v-icon mdi mdi-controller" style="font-size: 16px; color: #a78bfa;"></i></div>`;

    toast.innerHTML = `
      ${heroAvatarCover}
      <div class="romm-custom-session-info" style="padding-right: 24px;">
        <div class="romm-custom-session-user">
          <span>${session.username || 'Joueur'}</span>
          <span class="romm-online-dot romm-custom-toast-online-dot"></span>
        </div>
        <div class="romm-custom-session-game-row">
          ${coverHtml}
          <div class="romm-custom-session-game-details">
            <div class="romm-custom-session-game">${session.rom_name || 'Jeu'}</div>
            <div class="romm-custom-session-plat">${session.platform_name || session.platform_slug || 'En jeu'}</div>
          </div>
        </div>
      </div>
      <button class="romm-toast-close-btn" title="Fermer">✕</button>
    `;

    toast.onclick = function(e) {
      if (e.target.classList.contains('romm-toast-close-btn')) {
        e.stopPropagation();
        toast.remove();
        return;
      }
      if (session.rom_id && session.rom_id > 0) {
        navigateToRom(session.rom_id);
        toast.remove();
      }
    };

    container.appendChild(toast);

    setTimeout(function() {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-6px)';
        setTimeout(function() { toast.remove(); }, 300);
      }
    }, 7000);
  }

  function updateGalleryActiveGameDots() {
    // Clean up any old dot elements first
    document.querySelectorAll('.romm-active-game-live-dot, .romm-card-title-online-dot').forEach(function(el) {
      el.remove();
    });

    if (!activeSessionsList || activeSessionsList.length === 0) return;

    var activeRomIds = {};
    activeSessionsList.forEach(function(s) {
      if (s.rom_id && s.rom_id > 0) activeRomIds[String(s.rom_id)] = s;
    });

    // Query ONLY top-level game cards
    var cards = document.querySelectorAll('.r-gc, .r-gcs');
    cards.forEach(function(card) {
      var link = card.querySelector('a[href*="/rom/"]') || card.closest('a[href*="/rom/"]') || card;
      var href = link ? (link.getAttribute('href') || link.href || '') : '';
      var match = href.match(/\/rom\/(\d+)/);
      var romId = match ? match[1] : card.getAttribute('data-rom-id');

      if (romId && activeRomIds[romId]) {
        var label = card.querySelector('.r-gc__label, .r-gcs__label');
        if (label && !label.querySelector('.romm-card-title-online-dot')) {
          var dot = document.createElement('span');
          dot.className = 'romm-online-dot romm-card-title-online-dot';
          dot.title = (activeRomIds[romId].username || 'Un joueur') + ' joue actuellement';
          label.appendChild(dot);
        }
      }
    });
  }

  function renderActiveSessionsWidget() {
    var heroPick = document.querySelector('.r-v2-widget--hero-pick, .r-v2-widget:has(.r-v2-widget-pick__body)');
    if (!heroPick) return;
    var widgetRow = heroPick.parentElement;
    if (!widgetRow) return;

    var existingWidget = document.getElementById('romm-custom-active-sessions-widget');
    if (!existingWidget) {
      var widget = document.createElement('div');
      widget.id = 'romm-custom-active-sessions-widget';
      widget.className = 'romm-custom-active-sessions-widget r-v2-widget r-v2-widget--hero-sessions';
      widgetRow.appendChild(widget);
      existingWidget = widget;
    }

    // EXACT NATIVE WIDGET HEADER MATCHING (LIKE STATISTIQUES DE LA BIBLIOTHÈQUE)
    var html = `
      <div class="r-v2-widget__header romm-custom-widget-title">
        <div class="r-v2-widget__title">SESSIONS DE JEU</div>
        <div class="r-v2-widget__subtitle romm-custom-widget-count">
          ${activeSessionsList.length} EN LIGNE
        </div>
      </div>
    `;

    if (activeSessionsList.length > 0) {
      html += `<div class="romm-custom-sessions-list">`;
      activeSessionsList.forEach(function(s) {
        var isPlaying = s.rom_id && s.rom_id > 0;
        var heroAvatarCover = getAvatarHtml(s, true);

        if (!isPlaying) {
          // ONLINE BROWSING USER: AVATAR FAR LEFT, USERNAME TOP, "En ligne sur le site" BELOW
          html += `
            <div class="romm-custom-session-card" data-rom-id="0" style="cursor: default;">
              <div class="romm-custom-session-avatar-cover">
                ${heroAvatarCover}
              </div>
              <div class="romm-custom-session-info">
                <div class="romm-custom-session-user">
                  <span>${s.username || 'Joueur'}</span>
                </div>
                <div class="romm-custom-session-online-text">En ligne sur le site</div>
              </div>
            </div>
          `;
        } else {
          // ACTIVE GAME PLAYER: AVATAR FAR LEFT, USERNAME TOP (WITH GREEN DOT), GAME COVER THUMBNAIL NEXT TO GAME TITLE + PLATFORM BADGE
          var gameTitle = s.rom_name || 'Jeu';
          var platformBadge = s.platform_name || s.platform_slug || 'En jeu';
          var coverUrl = getCoverUrl(s);
          var coverHtml = coverUrl
            ? `<div class="romm-custom-session-game-cover"><img src="${coverUrl}" onerror="this.style.display='none';" /></div>`
            : `<div class="romm-custom-session-game-cover" style="background: rgba(167, 139, 250, 0.12); border-radius: 5px; border: 1px solid rgba(167, 139, 250, 0.2);"><i class="v-icon mdi mdi-controller" style="font-size: 16px; color: #a78bfa;"></i></div>`;

          html += `
            <div class="romm-custom-session-card" data-rom-id="${s.rom_id}" style="cursor: pointer;">
              <div class="romm-custom-session-avatar-cover">
                ${heroAvatarCover}
              </div>
              <div class="romm-custom-session-info">
                <div class="romm-custom-session-user">
                  <span>${s.username || 'Joueur'}</span>
                  <span class="romm-online-dot romm-custom-widget-online-dot"></span>
                </div>
                <div class="romm-custom-session-game-row">
                  ${coverHtml}
                  <div class="romm-custom-session-game-details">
                    <div class="romm-custom-session-game">${gameTitle}</div>
                    <div class="romm-custom-session-plat">${platformBadge}</div>
                  </div>
                </div>
              </div>
              <i class="v-icon mdi mdi-chevron-right" style="color: #64748b; font-size: 18px; margin-left: auto;"></i>
            </div>
          `;
        }
      });
      html += `</div>`;
    } else {
      html += `
        <div class="romm-custom-sessions-empty">
          <i class="v-icon mdi mdi-account-off-outline" style="font-size: 32px; color: #475569;"></i>
          <span>Aucun utilisateur en ligne actuellement</span>
        </div>
      `;
    }

    existingWidget.innerHTML = html;

    // Attach click listeners to active session cards
    var cards = existingWidget.querySelectorAll('.romm-custom-session-card');
    cards.forEach(function(card) {
      card.addEventListener('click', function(e) {
        var romId = card.getAttribute('data-rom-id');
        if (romId && romId !== '0') {
          e.preventDefault();
          e.stopPropagation();
          navigateToRom(romId);
        }
      });
    });
  }

  var onlineUserIds = {};

  function fetchActiveSessions() {
    getCurrentUser();
    // 1. Fetch recently-online users via last_active (read-only GET, no CSRF needed)
    fetch('/api/users')
      .then(function(res) { if (!res.ok) return []; return res.json(); })
      .then(function(users) {
        if (!Array.isArray(users)) return;
        var now = Date.now();
        onlineUserIds = {};
        users.forEach(function(u) {
          if (!u.last_active) return;
          var lastActive = new Date(u.last_active).getTime();
          if (now - lastActive < 5 * 60 * 1000) { // within last 5 minutes
            onlineUserIds[u.id] = u;
          }
        });
      })
      .catch(function() {});

    // 2. Fetch active play sessions from Redis
    fetch('/api/activity?v=' + Date.now())
      .then(function(res) {
        if (!res.ok) return [];
        return res.json();
      })
      .then(function(data) {
        if (Array.isArray(data)) {
          var newKnown = {};
          var playingUserIds = {};
          data.forEach(function(session) {
            if (session.rom_id && session.rom_id > 0) {
              var sessionKey = session.user_id + '_' + session.rom_id;
              newKnown[sessionKey] = true;
              var isSelf = (currentUserId && session.user_id == currentUserId) || (currentUsername && session.username && session.username.toLowerCase() === currentUsername);
              if (!isInitialFetch && !knownActiveSessions[sessionKey] && !isSelf) {
                showGameLaunchToast(session);
              }
              playingUserIds[session.user_id] = true;
            }
          });
          knownActiveSessions = newKnown;
          isInitialFetch = false;

          // Build merged list: playing users first, then browsing users
          var merged = data.slice();
          Object.keys(onlineUserIds).forEach(function(uid) {
            if (!playingUserIds[uid]) {
              var u = onlineUserIds[uid];
              merged.push({
                user_id: u.id,
                username: u.username,
                avatar_path: u.avatar_path || '',
                rom_id: 0,
                rom_name: '',
                platform_name: '',
                platform_slug: '',
                device_id: 'web',
                device_type: 'web',
                started_at: u.last_active
              });
            }
          });

          activeSessionsList = merged;
          renderActiveSessionsWidget();
          updateGalleryActiveGameDots();
        }
      })
      .catch(function(err) {
        console.warn('[ROMM ACTIVE SESSIONS] Error fetching activity:', err);
      });
  }

  // Poll Active Sessions every 2 seconds
  fetchActiveSessions();
  setInterval(fetchActiveSessions, 2000);

  // Surgical Platform Generation Header Label & DOM Ordering Engine
  function updatePlatformGenerationsDOM() {
    // A. Leaf Node Text Translation: ONLY translate Gen 99 / 99 / 99th generation -> Cloud
    var leafNodes = document.querySelectorAll(
      '.v-list-group__header, .v-list-item-title, .v-list-subheader, .r-v2-shell__header, .r-v2-gallery-section__title, .v-card-title, .r-v2-widget__title, h1, h2, h3, h4, span, div'
    );

    leafNodes.forEach(function(el) {
      if (el.children.length > 0) return; // Skip parent containers!
      var txt = (el.textContent || '').trim();

      // ONLY translate Generation 99 -> Cloud
      if (/^(Gen 99|99th Generation|99th generation|99e|99)$/i.test(txt) || txt === 'Gen 99' || txt === '99') {
        el.textContent = 'Cloud';
      }
    });

    // B. Re-order DOM Sections: Move "Cloud" section below "Unknown generation" or "Other"
    var sections = document.querySelectorAll('.r-v2-gallery-section, .r-v2-shell__group, .v-list-group, .r-v2-drawer-group, div > div');
    var cloudSec = null;
    var unknownSec = null;

    sections.forEach(function(sec) {
      // Find direct section containers that contain the section header
      var header = sec.querySelector('h1, h2, h3, h4, .v-list-subheader, .r-v2-shell__header, .v-list-group__header, .r-v2-pidx__group-heading');
      if (!header) return;
      var hText = (header.textContent || '').trim().toLowerCase();

      if (hText === 'cloud') {
        cloudSec = sec;
      }
      if (hText.includes('unknown') || hText.includes('inconnue') || hText === 'other' || hText.includes('autre')) {
        unknownSec = sec;
      }
    });

    if (cloudSec && unknownSec && cloudSec.parentNode === unknownSec.parentNode) {
      var parent = unknownSec.parentNode;
      if (cloudSec.compareDocumentPosition(unknownSec) & Node.DOCUMENT_POSITION_FOLLOWING) {
        var nextNode = unknownSec.nextSibling;
        if (nextNode) {
          parent.insertBefore(cloudSec, nextNode);
        } else {
          parent.appendChild(cloudSec);
        }
      }
    }
  }

  // Route & Body Tagging Observer strictly for /platform/ and /search
  var lastUrl = window.location.href;
  setInterval(function() {
    var currentUrl = window.location.href;
    var isGalleryViewPage = (
      currentUrl.includes('/platform/') ||
      (currentUrl.includes('/platform') && !currentUrl.endsWith('/platforms') && !currentUrl.endsWith('/platforms/')) ||
      currentUrl.includes('/search') ||
      window.location.hash.includes('/search') ||
      window.location.search.includes('search_term')
    );

    if (isGalleryViewPage) {
      if (!document.body.classList.contains('r-v2-platform-active')) {
        document.body.classList.add('r-v2-platform-active');
      }
      updateGalleryActiveGameDots();
    } else {
      if (document.body.classList.contains('r-v2-platform-active')) {
        document.body.classList.remove('r-v2-platform-active');
      }
    }

    lastUrl = currentUrl;

    // 1. Tag Hero Random Pick and Library Stats Widgets
    var pickBody = document.querySelector('.r-v2-widget-pick__body, .r-v2-widget-pick__empty');
    if (pickBody) {
      var pickCard = pickBody.closest('.r-v2-widget');
      if (pickCard && !pickCard.classList.contains('r-v2-widget--hero-pick')) {
        pickCard.classList.add('r-v2-widget--hero-pick');
      }
    }
    var statsBody = document.querySelector('.r-v2-widget-lib__stats');
    if (statsBody) {
      var statsCard = statsBody.closest('.r-v2-widget');
      if (statsCard && !statsCard.classList.contains('r-v2-widget--hero-stats')) {
        statsCard.classList.add('r-v2-widget--hero-stats');
      }
    }

    // Ensure Active Sessions widget exists on Dashboard without re-rendering innerHTML every 250ms
    var heroPick = document.querySelector('.r-v2-widget--hero-pick, .r-v2-widget:has(.r-v2-widget-pick__body)');
    if (heroPick && !document.getElementById('romm-custom-active-sessions-widget')) {
      renderActiveSessionsWidget();
    }

    // 2. Hide manual Save State & Load State buttons in EmulatorJS menu bar for Arcade games (MAME, FBNeo, FBAlpha)
    var isArcade = (
      window.location.href.includes('platform/arcade') ||
      window.location.href.includes('/platforms/arcade') ||
      window.location.href.includes('arcade') ||
      window.location.href.includes('/play/') ||
      (window.EJS_core && (window.EJS_core.includes('mame') || window.EJS_core.includes('fbneo') || window.EJS_core.includes('fbalpha'))) ||
      document.querySelector('#game')
    );

    if (isArcade) {
      var menuButtons = document.querySelectorAll('#game .ejs_menu_bar .ejs_menu_button');
      menuButtons.forEach(function(btn) {
        var text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'save state' || text === 'load state' || text === 'load latest state') {
          btn.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important;');
        }
      });
    }

    // 3. Platform Generation Label & DOM Ordering Observer (ONLY Cloud label & DOM ordering)
    updatePlatformGenerationsDOM();

    // 4. Ensure EmulatorJS Game Canvas has proper touch-action and tabindex for Mouse & Touch input (NDS / DOS)
    var gameDiv = document.getElementById('game');
    if (gameDiv) {
      var gameCanvas = gameDiv.querySelector('canvas');
      if (gameCanvas) {
        if (gameCanvas.style.touchAction !== 'none') {
          gameCanvas.style.touchAction = 'none';
        }
        if (!gameCanvas.getAttribute('tabindex')) {
          gameCanvas.setAttribute('tabindex', '0');
        }
      }
    }



  }, 250);

  // Versioned Cache Purge
  try {
    var CACHE_VERSION_KEY = 'romm_custom_cache_v230';
    if (!localStorage.getItem(CACHE_VERSION_KEY)) {
      localStorage.setItem(CACHE_VERSION_KEY, 'true');
      localStorage.removeItem('v2.gallery.groupBy');
      localStorage.removeItem('settings.platformsGroupBy');
      if (window.caches) {
        caches.keys().then(function(names) {
          names.forEach(function(name) { caches.delete(name); });
        });
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          registrations.forEach(function(reg) { reg.unregister(); });
        });
      }
      console.log('[ROMM CACHE PURGE] Cleared stale Service Worker and browser cacheStorage.');
    }
  } catch(e) {
    console.warn('[ROMM CACHE PURGE] Error clearing cache:', e);
  }

})();


  // Elastic Spring Bounce & Dice Reroll Spin Engine
  (function initRandomPickSpringEngine() {
    document.addEventListener('click', function(e) {
      var rerollBtn = e.target.closest('.r-v2-widget-pick__reroll');
      if (!rerollBtn) return;
      
      rerollBtn.classList.remove('is-spinning');
      void rerollBtn.offsetWidth;
      rerollBtn.classList.add('is-spinning');

      var widgetCard = rerollBtn.closest('.r-v2-widget');
      if (widgetCard) {
        var cardBody = widgetCard.querySelector('.r-v2-widget-pick__body');
        if (cardBody) {
          cardBody.classList.remove('is-bouncing');
          void cardBody.offsetWidth;
          cardBody.classList.add('is-bouncing');
        }
      }
    });
  })();
