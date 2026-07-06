/** Embed session query param (passed on launch + API fetches in iframes). */
export const EMBED_SESSION_PARAM = "_st";

/** Non-httpOnly cookie so embedded iframes can attach `_st` to API fetches. */
export const EMBED_API_COOKIE_NAME = "pinnacle_embed_st";

/** Internal request headers set by middleware so RSC can auth without cookies. */
export const EMBED_SESSION_HEADER = "x-pinnacle-embed-session";
export const EMBED_LOCATION_HEADER = "x-pinnacle-embed-location";

/** Parent pages listen for this so hero iframes can clear loading overlays. */
export const EMBED_READY_MESSAGE_TYPE = "pinnacle-embed-ready";
