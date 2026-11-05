# Garden interface

Operate mode: current conditions, individual sensor history, live cameras, and site exploration.

Preserve the user's weather-dashboard reference: University of Dubai branding, fine navigation, large light-weight readings, two top panels and three lower panels on Overview. Home adds the Three.js site view. Every navigation item renders its own page, rather than scrolling to a section.

Pure white / pure black page backgrounds; neutral surfaces and cards; Inter with native sans-serif fallback; 12–18px radii on cards. Home has no outer frame. Values are placed in a collapsible Environment panel. No card tints: color is reserved for UV, AQI and irradiance scales with a thin current-value marker. Irradiance bands describe intensity, not a safety classification. All station readings are grouped by measurement type, retaining individual sensor histories.

Reading merges current values and history into one page. Its asymmetric twelve-column composition gives temperature and wind larger feature tiles, pairs humidity, uses a wide solar section, and balances rainfall against air quality. Every sensor keeps a category icon, label, current value, and history action. Mobile restacks those compositions into deliberate paired and full-width tiles. Chart dialogs use native modal focus management and Escape dismissal. Numeric charts retain gaps; directional data uses scatter; rainfall uses bars; categorical values use a table.

The 3D scene uses Three.js geometry and lighting. The user's sketch is the layout authority: rear ground-mounted solar panels on the left, two extractors in the middle, two pots to their right, tank behind the pots. A separate full-length solar parking canopy stands in front. Sketch numbers denote ten parking spaces, independent of the solar panel count. Camera 1 mounts on an extractor; Camera 2 near the middle of the canopy structure. No freestanding camera poles. Tubes connect extractors → tank → pots, with explicitly illustrative directional animation. No invented water level or plant sensor. Orbit, zoom, and reset have explicit buttons.

No status badges or dots. AI remains an inert preview. Missing or failed data is explained in plain text. Mobile layouts stack the weather panels and use two sensor columns, with a fitted 3D view and centered scrollable history dialog.
