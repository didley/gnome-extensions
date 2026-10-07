// [body, header] colours, in the order the colour button cycles through them
// (the same set Stickies on macOS offers).
export const COLORS = {
    Yellow: ['#fff1a8', '#f5dc70'],
    Blue: ['#c4e5ff', '#92c8f2'],
    Green: ['#cbf1c3', '#9fdc94'],
    Pink: ['#ffcce0', '#f4a4c3'],
    Purple: ['#e0d0ff', '#c0a8f4'],
    Gray: ['#e6e6e6', '#c6c6c6'],
};

export const DEFAULT_COLOR = 'Yellow';

export function colorPair(name) {
    return COLORS[name] ?? COLORS[DEFAULT_COLOR];
}

/** The colour after `name`, wrapping around. Unknown names start from the first colour. */
export function nextColor(name) {
    const names = Object.keys(COLORS);
    return names[(names.indexOf(name) + 1) % names.length];
}
