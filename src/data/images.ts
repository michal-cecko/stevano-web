// Photo registry. Keys are generated from scripts/image-briefs.json by
// scripts/generate-images.mjs — keep the two in sync when adding/removing images.
export const STEVANO_IMG = {
  hero:              "/img/hero.jpg",
  about:             "/img/about.jpg",

  hotel_room:        "/img/hotel-room.jpg",
  hotel_corridor:    "/img/hotel-corridor.jpg",
  hotel_lobby:       "/img/hotel-lobby.jpg",
  hotel_bathroom:    "/img/hotel-bathroom.jpg",
  hotel_cart:        "/img/hotel-cart.jpg",

  rest_dining:       "/img/rest-dining.jpg",
  rest_bar:          "/img/rest-bar.jpg",
  rest_afterclose:   "/img/rest-afterclose.jpg",
  rest_boh:          "/img/rest-boh.jpg",
  rest_table:        "/img/rest-table.jpg",

  apt_living:        "/img/apt-living.jpg",
  apt_bedroom:       "/img/apt-bedroom.jpg",
  apt_bathroom:      "/img/apt-bathroom.jpg",
  apt_kitchen:       "/img/apt-kitchen.jpg",
  apt_floor:         "/img/apt-floor.jpg",

  kitchen_line:      "/img/kitchen-line.jpg",
  kitchen_hood:      "/img/kitchen-hood.jpg",
  kitchen_foam:      "/img/kitchen-foam.jpg",
  kitchen_tiles:     "/img/kitchen-tiles.jpg",
  kitchen_equipment: "/img/kitchen-equipment.jpg",

  machine_scrubber:  "/img/machine-scrubber.jpg",
  machine_rotary:    "/img/machine-rotary.jpg",
  machine_industrial:"/img/machine-industrial.jpg",
  machine_tile:      "/img/machine-tile.jpg",
  machine_corridor:  "/img/machine-corridor.jpg",

  office_openplan:   "/img/office-openplan.jpg",
  office_conference: "/img/office-conference.jpg",
  office_kitchenette:"/img/office-kitchenette.jpg",
  office_washroom:   "/img/office-washroom.jpg",
  office_desk:       "/img/office-desk.jpg",

  airaroma:          "/img/airaroma.png",

  aroma_mini:        "/img/airaroma250ml.png",
  aroma_medium:      "/img/air_aroma_500ml.png",
  aroma_large:       "/img/air_aroma_1000ml.png",

  og:                "/img/og.jpg"        // branded social-share card (1.91:1)
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

