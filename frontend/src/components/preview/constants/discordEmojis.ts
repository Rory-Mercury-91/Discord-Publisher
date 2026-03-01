// Map des émojis Discord courants (format :nom: → Unicode)

export const discordEmojis: Record<string, string> = {
  computer: '💻',
  point_down: '👇',
  sparkling_heart: '💖',
  flag_fr: '🇫🇷',
  smile: '😄', grinning: '😀', smiley: '😃', grin: '😁', laughing: '😆', satisfied: '😆',
  joy: '😂', rofl: '🤣', relaxed: '☺️', blush: '😊', innocent: '😇', wink: '😉',
  heart_eyes: '😍', kissing_heart: '😘', kissing: '😗', yum: '😋', stuck_out_tongue: '😛',
  stuck_out_tongue_winking_eye: '😜', stuck_out_tongue_closed_eyes: '😝', thinking: '🤔',
  neutral_face: '😐', expressionless: '😑', no_mouth: '😶', smirk: '😏', unamused: '😒',
  roll_eyes: '🙄', grimacing: '😬', lying_face: '🤥', relieved: '😌', pensive: '😔',
  sleepy: '😪', sleeping: '😴', mask: '😷', thermometer_face: '🤒', head_bandage: '🤕',
  nauseated_face: '🤢', sneezing_face: '🤧', hot_face: '🥵', cold_face: '🥶', woozy_face: '🥴',
  dizzy_face: '😵', exploding_head: '🤯', cowboy: '🤠', partying_face: '🥳', monocle: '🧐',
  nerd: '🤓', sunglasses: '😎', clown: '🤡', shushing: '🤫', face_with_hand_over_mouth: '🤭',
  face_with_raised_eyebrow: '🤨', star_struck: '🤩', partying: '🥳',
  tada: '🎉', rocket: '🚀', fire: '🔥', sparkles: '✨', star: '⭐', check: '✅', white_check_mark: '✅', x: '❌',
  warning: '⚠️', error: '🚫', info: 'ℹ️', question: '❓', exclamation: '❗',
  desktop: '🖥️', keyboard: '⌨️', mouse: '🖱️', joystick: '🕹️', video_game: '🎮',
  gear: '⚙️', tools: '🛠️', wrench: '🔧', hammer: '🔨', package: '📦',
  link: '🔗', attachment: '📎', floppy_disk: '💾', cd: '💿', arrow_right: '➡️',
  arrow_down: '⬇️', arrow_up: '⬆️', double_arrow_right: '⏩', cool: '🆒', new: '🆕',
  thumbsup: '👍', thumbsdown: '👎', ok_hand: '👌', raised_hands: '🙌', clap: '👏',
  pray: '🙏', handshake: '🤝', muscle: '💪', point_up: '👆', point_left: '👈',
  point_right: '👉', wave: '👋', v: '✌️', fingers_crossed: '🤞',
  heart: '❤️', blue_heart: '💙', green_heart: '💚', yellow_heart: '💛', purple_heart: '💜',
  black_heart: '🖤', orange_heart: '🧡', white_heart: '🤍', brown_heart: '🤎',
  broken_heart: '💔', heartbeat: '💓', heartpulse: '💗', cupid: '💘', revolving_hearts: '💞',
  flag_us: '🇺🇸', flag_gb: '🇬🇧', flag_jp: '🇯🇵', flag_de: '🇩🇪', flag_es: '🇪🇸',
  flag_it: '🇮🇹', flag_ru: '🇷🇺', flag_cn: '🇨🇳', flag_kr: '🇰🇷', flag_br: '🇧🇷',
  bulb: '💡', moneybag: '💰', gift: '🎁', bell: '🔔', megaphone: '📣',
  loudspeaker: '📢', eye: '👁️', eyes: '👀', speech_balloon: '💬', thought_balloon: '💭',
};

export function replaceEmojis(text: string): string {
  return text.replace(/:([a-z0-9_]+):/g, (match, p1) => discordEmojis[p1] ?? match);
}
