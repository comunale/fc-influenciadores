'use client'

import Image from 'next/image'

interface FoxLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function FoxLogo({ size = 'md', className = '' }: FoxLogoProps) {
  const sizes = { sm: 80, md: 120, lg: 180 }
  const px = sizes[size]

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Image
        src="/logo.png"
        alt="FoxCycles"
        width={px}
        height={px / 2}
        style={{ objectFit: 'contain' }}
        priority
        onError={(e) => {
          // Fallback se a logo não existir ainda
          const target = e.target as HTMLImageElement
          target.style.display = 'none'
          const parent = target.parentElement
          if (parent) {
            parent.innerHTML = `<span style="font-size:${px / 4}px;font-weight:900;color:#00ff87;letter-spacing:-1px;">FOX<span style="color:white;">CYCLES</span></span>`
          }
        }}
      />
    </div>
  )
}
