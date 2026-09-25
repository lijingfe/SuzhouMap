export function normalizeSearchText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•\-—_，。、《》“”"'()（）/\\]+/g, "");
}

export function matchesPlace(place, query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;

  const haystack = [
    place.name,
    ...(place.aliases ?? []),
    place.pinyin,
    place.pinyinInitials,
    place.region,
    ...(place.tags ?? []),
  ]
    .map(normalizeSearchText)
    .join("|");

  if (haystack.includes(normalized)) return true;

  let cursor = 0;
  for (const character of haystack) {
    if (character === normalized[cursor]) cursor += 1;
    if (cursor === normalized.length) return true;
  }
  return false;
}

export function haversineKm(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function estimateDriving(origin, destination, config) {
  const directKm = haversineKm(origin, destination);
  const adjustedKm = directKm * (directKm > 35 ? 1.18 : 1.28);
  const speed =
    directKm > 55
      ? config.drivingSpeedKmh.expressway
      : directKm > 18
        ? config.drivingSpeedKmh.suburban
        : config.drivingSpeedKmh.urban;
  return {
    directKm,
    adjustedKm,
    minutes: Math.max(5, Math.round((adjustedKm / speed) * 60)),
    method: "离线距离修正估算",
  };
}

function allRouteStations(routes) {
  const stations = new Map();
  for (const route of routes) {
    for (const stop of route.stops) {
      if (!stations.has(stop.name)) stations.set(stop.name, stop);
    }
  }
  return [...stations.values()];
}

function nearestStations(coordinate, stations, limit = 4) {
  return stations
    .map((station) => ({
      ...station,
      walkingKm: haversineKm(coordinate, station.coordinate),
    }))
    .sort((a, b) => a.walkingKm - b.walkingKm)
    .slice(0, limit);
}

function buildGraph(routes) {
  const graph = new Map();
  const addEdge = (from, to, line, minutes) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ to, line, minutes });
  };

  for (const route of routes) {
    for (let index = 1; index < route.stops.length; index += 1) {
      const previous = route.stops[index - 1];
      const current = route.stops[index];
      const distance = haversineKm(previous.coordinate, current.coordinate);
      const minutes = Math.max(1.5, (distance / 34) * 60 + 0.45);
      addEdge(previous.name, current.name, route.ref, minutes);
      addEdge(current.name, previous.name, route.ref, minutes);
    }
  }
  return graph;
}

function groupTransitEdges(edges) {
  const groups = [];
  for (const edge of edges) {
    const previous = groups[groups.length - 1];
    if (previous?.line === edge.line) {
      previous.to = edge.to;
      previous.minutes += edge.minutes;
      previous.stops += 1;
    } else {
      groups.push({
        mode: "轨道交通",
        line: edge.line,
        from: edge.from,
        to: edge.to,
        minutes: edge.minutes,
        stops: 1,
      });
    }
  }
  return groups.map((group) => ({
    ...group,
    minutes: Math.round(group.minutes),
  }));
}

export function buildTransitPlan(origin, destination, routes, config) {
  if (!routes?.length) return null;
  const stations = allRouteStations(routes);
  const starts = nearestStations(origin, stations);
  const ends = nearestStations(destination, stations);
  if (!starts.length || !ends.length) return null;
  if (starts[0].walkingKm > 12 || ends[0].walkingKm > 12) return null;

  const graph = buildGraph(routes);
  const endByName = new Map(ends.map((station) => [station.name, station]));
  const queue = [];
  const best = new Map();

  for (const station of starts) {
    const walkingMinutes = (station.walkingKm / config.walkingSpeedKmh) * 60;
    const state = {
      station: station.name,
      line: null,
      cost: walkingMinutes + config.subwayWaitMinutes,
      previous: null,
      edge: null,
      originWalkKm: station.walkingKm,
    };
    queue.push(state);
    best.set(`${state.station}|`, state.cost);
  }

  let winner = null;
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (winner && current.cost >= winner.cost) break;
    const key = `${current.station}|${current.line ?? ""}`;
    if (current.cost > (best.get(key) ?? Infinity)) continue;

    const endStation = endByName.get(current.station);
    if (endStation) {
      const finalCost =
        current.cost +
        (endStation.walkingKm / config.walkingSpeedKmh) * 60;
      if (!winner || finalCost < winner.cost) {
        winner = {
          state: current,
          endStation,
          cost: finalCost,
        };
      }
    }

    for (const edge of graph.get(current.station) ?? []) {
      const transfer =
        current.line && current.line !== edge.line
          ? config.subwayWaitMinutes
          : 0;
      const nextCost = current.cost + edge.minutes + transfer;
      const nextKey = `${edge.to}|${edge.line}`;
      if (nextCost >= (best.get(nextKey) ?? Infinity)) continue;
      best.set(nextKey, nextCost);
      queue.push({
        station: edge.to,
        line: edge.line,
        cost: nextCost,
        previous: current,
        edge: {
          from: current.station,
          to: edge.to,
          line: edge.line,
          minutes: edge.minutes + transfer,
          transfer: transfer > 0,
        },
        originWalkKm: current.originWalkKm,
      });
    }
  }

  if (!winner) return null;
  const edges = [];
  let cursor = winner.state;
  while (cursor?.edge) {
    edges.unshift(cursor.edge);
    cursor = cursor.previous;
  }

  const transitGroups = groupTransitEdges(edges);
  const transfers = Math.max(0, new Set(edges.map((edge) => edge.line)).size - 1);
  const originWalkingMinutes = Math.round(
    (winner.state.originWalkKm / config.walkingSpeedKmh) * 60,
  );
  const destinationWalkingMinutes = Math.round(
    (winner.endStation.walkingKm / config.walkingSpeedKmh) * 60,
  );

  return {
    totalMinutes: Math.round(winner.cost),
    transfers,
    originWalkKm: winner.state.originWalkKm,
    destinationWalkKm: winner.endStation.walkingKm,
    steps: [
      {
        mode: "步行",
        from: "起点",
        to: transitGroups[0]?.from ?? starts[0].name,
        minutes: originWalkingMinutes,
        distanceKm: winner.state.originWalkKm,
      },
      ...transitGroups,
      {
        mode: "步行",
        from: transitGroups[transitGroups.length - 1]?.to ?? winner.endStation.name,
        to: "终点",
        minutes: destinationWalkingMinutes,
        distanceKm: winner.endStation.walkingKm,
      },
    ],
  };
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return "暂无";
  if (minutes < 60) return `${Math.round(minutes)}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}小时${remainder}分钟` : `${hours}小时`;
}
