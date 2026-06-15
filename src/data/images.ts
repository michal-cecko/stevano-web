export const STEVANO_IMG = {
  hero:       "/img/hero.jpg",
  lobby:      "/img/lobby.jpg",
  room:       "/img/room.jpg",
  corridor:   "/img/corridor.jpg",
  restaurant: "/img/restaurant.jpg",
  office:     "/img/office.jpg",
  kitchen:    "/img/kitchen.jpg",
  team:       "/img/team.jpg",
  spray:      "/img/spray.jpg",
  bathroom:   "/img/bathroom.jpg",
  lounge:     "/img/lounge.jpg",
  conference: "/img/conference.jpg"
};

// graphite tint overlaid on each photo so imagery stays on-brand (Graphite & Ice)
export function tint(level){
  if(level === "soft")  return "linear-gradient(160deg, rgba(13,16,19,.20), rgba(13,16,19,.40))";
  if(level === "scrim") return "linear-gradient(to top, rgba(8,10,12,.78), rgba(13,16,19,.30) 60%)";
  if(level === "veil")  return "linear-gradient(rgba(13,16,19,.72), rgba(13,16,19,.78))";
  if(level === "none")  return null;
  return "linear-gradient(160deg, rgba(13,16,19,.32), rgba(13,16,19,.52))";
}
export function photoStyle(key, level){
  const url = STEVANO_IMG[key];
  const t = tint(level);
  if(!url) return "";
  return "background-image:" + (t ? t + ", " : "") + 'url("' + url + '");background-size:cover;background-position:center;background-repeat:no-repeat;';
}

