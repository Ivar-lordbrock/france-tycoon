// polylabel 2.x est livré sans types.
declare module 'polylabel' {
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean,
  ): [number, number] & { distance: number };
}
