#!/bin/bash
# Downloads the OpenStreetMap layers for the board. Run from the project root.
mkdir -p tools/osm
B="12.83,77.46,13.11,77.80"
q() { name=$1; body=$2; for i in 1 2 3 4; do
  code=$(curl -s -m 170 -A "bengaluru-map-builder/1.0" -o tools/osm/$name.json -w "%{http_code}" --data-urlencode "data=[out:json][timeout:160];$body" https://overpass-api.de/api/interpreter)
  echo "$name try$i $code $(wc -c < tools/osm/$name.json)"; [ "$code" = "200" ] && break; sleep 5; done; }
q water "(way[\"natural\"=\"water\"]($B);relation[\"natural\"=\"water\"]($B);way[\"landuse\"=\"reservoir\"]($B););out geom;"
q roads "way[\"highway\"~\"^(motorway|trunk|primary|secondary)$\"]($B);out geom;"
q rail "(way[\"railway\"~\"^(rail|subway|light_rail)$\"]($B);way[\"aeroway\"=\"runway\"]($B););out geom;"
q green "(way[\"leisure\"=\"park\"]($B);way[\"landuse\"~\"^(forest|recreation_ground|cemetery|farmland|meadow|grass)$\"]($B);way[\"natural\"=\"wood\"]($B);relation[\"leisure\"=\"park\"]($B);way[\"leisure\"=\"golf_course\"]($B););out geom;"
q tertiary "way[\"highway\"~\"^(tertiary)$\"]($B);out geom;"
q metro "relation[\"route\"~\"^(subway|light_rail)$\"]($B);out geom;"
