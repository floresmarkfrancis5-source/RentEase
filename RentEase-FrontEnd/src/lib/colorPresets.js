export const COLOR_KEYS = ['accent_color', 'header_color', 'hero_color_from', 'hero_color_to']

export const COLOR_PRESETS = [
  {
    name: 'Default',
    accent_color: '#E05A47',
    header_color: '#1E4620',
    hero_color_from: '#1E4620',
    hero_color_to: '#4A7450',
    light: { accent_color: '#E46E5D', header_color: '#476748', hero_color_from: '#476748', hero_color_to: '#729377' },
  },
  {
    name: 'Red',
    accent_color: '#CC5E59',
    header_color: '#562F32',
    hero_color_from: '#9A4548',
    hero_color_to: '#C36C65',
    light: { accent_color: '#D7746D', header_color: '#95565A', hero_color_from: '#AC6568', hero_color_to: '#D68D83' },
  },
  {
    name: 'Orange',
    accent_color: '#D07843',
    header_color: '#573722',
    hero_color_from: '#A85B30',
    hero_color_to: '#CE8048',
    light: { accent_color: '#DB8D5A', header_color: '#936242', hero_color_from: '#BA7549', hero_color_to: '#D79A66' },
  },
  {
    name: 'Yellow',
    accent_color: '#B38D32',
    header_color: '#51441F',
    hero_color_from: '#92752C',
    hero_color_to: '#BD9B45',
    light: { accent_color: '#C6A64B', header_color: '#82713C', hero_color_from: '#A58A3E', hero_color_to: '#CEB05D' },
  },
  {
    name: 'Brown',
    accent_color: '#A8734D',
    header_color: '#443329',
    hero_color_from: '#76513B',
    hero_color_to: '#A37A55',
    light: { accent_color: '#BC8960', header_color: '#76604F', hero_color_from: '#90705A', hero_color_to: '#BA9971' },
  },
  {
    name: 'Green',
    accent_color: '#6F966F',
    header_color: '#2D472F',
    hero_color_from: '#426B46',
    hero_color_to: '#70966F',
    light: { accent_color: '#84A784', header_color: '#5C7C5D', hero_color_from: '#668669', hero_color_to: '#91B191' },
  },
  {
    name: 'Blue',
    accent_color: '#628BA3',
    header_color: '#2E4657',
    hero_color_from: '#496F7C',
    hero_color_to: '#7296AD',
    light: { accent_color: '#50778F', header_color: '#496A80', hero_color_from: '#456779', hero_color_to: '#567A8C' },
  },
  {
    name: 'Violet',
    accent_color: '#947BB0',
    header_color: '#41334F',
    hero_color_from: '#66517F',
    hero_color_to: '#9A84B1',
    light: { accent_color: '#A88FBE', header_color: '#726184', hero_color_from: '#84719B', hero_color_to: '#B3A1C7' },
  },
  {
    name: 'Pink',
    accent_color: '#C27B91',
    header_color: '#513641',
    hero_color_from: '#89566E',
    hero_color_to: '#BD8295',
    light: { accent_color: '#CF91A3', header_color: '#875D70', hero_color_from: '#A36F82', hero_color_to: '#D09AA9' },
  },
]

export function paletteColors(settings, mode) {
  const preset = COLOR_PRESETS.find((candidate) =>
    COLOR_KEYS.every((key) => String(settings[key]).toLowerCase() === candidate[key].toLowerCase()),
  )

  if (!preset || mode !== 'light') return settings
  return { ...settings, ...preset.light }
}
