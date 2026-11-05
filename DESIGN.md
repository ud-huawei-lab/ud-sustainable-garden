# Garden interface

Authentication preserves the original dashboard's centered, understated branded sign-in panel, visible field labels, password-manager autocomplete, neutral submit button, inline errors, and existing light/dark theme. Authenticated navigation includes a labeled logout control. No dashboard data mounts before the server validates the session.

Operate mode: current conditions, individual sensor history, live cameras, and site exploration.

Preserve the user's weather-dashboard reference: University of Dubai branding, fine navigation, large light-weight readings, two top panels and three lower panels on Overview. Home adds the Three.js site view. Every navigation item renders its own page, rather than scrolling to a section.

White / black page backgrounds with an experimental subtle green radial glow fading from the upper right; neutral surfaces and cards; Inter with native sans-serif fallback; 12–18px radii on cards. Home has no outer frame. Values are placed in a collapsible Environment panel. No card tints: color is reserved for UV, AQI and irradiance scales with a thin current-value marker. Irradiance bands describe intensity, not a safety classification. All station readings are grouped by measurement type, retaining individual sensor histories.

Reading combines all current values and history in three independent category columns, adapting to two and then one on smaller screens. Every sensor keeps a category icon, label, current value, and history action. Chart dialogs use native modal focus management and Escape dismissal. Numeric charts retain gaps; directional data uses scatter; rainfall uses bars; categorical values use a table. A value tooltip follows the pointer and stays within chart edges. There is no chart slider; focusing the graph enables arrow-key, Home, and End navigation with a live text readout.

The 3D scene uses Three.js geometry and lighting. The user's sketch is the layout authority: rear ground-mounted solar panels on the left, two extractors in the middle, two pots to their right, tank behind the pots. A separate full-length solar parking canopy stands in front. Sketch numbers denote ten parking spaces, independent of the solar panel count. Camera 1 mounts on an extractor; Camera 2 near the middle of the canopy structure. No freestanding camera poles. Tubes connect extractors → tank → pots, with explicitly illustrative directional animation. No invented water level or plant sensor. Orbit, zoom, and reset have explicit buttons.

No status badges or dots. AI remains an inert preview. Missing or failed data is explained in plain text. Mobile layouts stack the weather panels and use two sensor columns, with a fitted 3D view and centered scrollable history dialog.

CCTV uses clean edge-to-edge feeds, subtle camera name/time/fullscreen overlays, skeleton startup, and a centered retry state. Compact hover/focus playback controls provide play/pause, mute, volume, and return-to-live; touch controls stay visible. No native transport controls, duplicate expanded player, or snapshot request during startup. Reading has no promotional introduction or duplicate View history action; each tile keeps one top-right arrow. Data, history, session, and lazy scene loading use skeletons with reduced-motion support. Home offers 3D, an orthographic 2D plan, and an independent wireframe toggle.
