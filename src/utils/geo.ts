const earthRadiusKm = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

// The great-circle distance between two points, in kilometres.
export const distanceKm = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) => {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
};
