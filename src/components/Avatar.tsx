interface Props {
  seed: string
  size?: number
  className?: string
}

// Fun, deterministic avatars from DiceBear (no key, nothing stored server-side).
// Same seed → same face, so each user keeps a stable avatar by their senderId.
const STYLE = 'fun-emoji'

export default function Avatar({ seed, size = 28, className = '' }: Props) {
  const url = `https://api.dicebear.com/9.x/${STYLE}/svg?seed=${encodeURIComponent(seed)}`
  return (
    <img
      src={url}
      alt="avatar"
      width={size}
      height={size}
      className={`rounded-full bg-gray-700 flex-shrink-0 ${className}`}
      loading="lazy"
    />
  )
}
