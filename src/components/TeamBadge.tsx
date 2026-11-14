import React, { useState } from 'react';
import { getTeamBadge, TeamBadgeData } from '../services/teamBadgeService';

export interface TeamBadgeProps {
  team: {
    name: string;
    shortName?: string;
    logo?: string;
    badgeUrl?: string;
    country?: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  showTooltip?: boolean;
}

const SIZE_MAP = {
  xs: 20,
  sm: 26,
  md: 34,
  lg: 46,
  xl: 60,
};

export const TeamBadge: React.FC<TeamBadgeProps> = ({
  team,
  size = 'md',
  className = '',
  showTooltip = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const badgeData: TeamBadgeData = getTeamBadge(team.name, team.country);
  const resolvedBadgeUrl = team.badgeUrl || badgeData.badgeUrl;

  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || SIZE_MAP.md;
  const shortCode = team.shortName || badgeData.shortCode;

  // Determine font size for SVG fallback
  const fontSize = Math.max(8, Math.round(pixelSize * 0.32));

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none group transition-transform duration-200 ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
      title={showTooltip ? `${team.name} (${badgeData.symbol})` : undefined}
      aria-label={`${team.name} badge`}
    >
      {resolvedBadgeUrl && !imageError ? (
        <div className="w-full h-full p-0.5 flex items-center justify-center">
          <img
            src={resolvedBadgeUrl}
            alt={`${team.name} crest`}
            loading="lazy"
            crossOrigin="anonymous"
            className="w-full h-full object-contain filter drop-shadow-sm transition-transform duration-200 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        /* Authentic Heraldic Vector Crest Shield Fallback */
        <svg
          viewBox="0 0 100 115"
          className="w-full h-full filter drop-shadow-md transition-transform duration-200 group-hover:scale-105"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`grad-${shortCode}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={badgeData.primaryColor} />
              <stop offset="100%" stopColor={badgeData.secondaryColor} />
            </linearGradient>
            <filter id={`shadow-${shortCode}`} x1="-10%" y1="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Shield Outline Path */}
          <path
            d="M50 5 L88 18 C88 65 65 98 50 110 C35 98 12 65 12 18 Z"
            fill={`url(#grad-${shortCode})`}
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeOpacity="0.85"
            filter={`url(#shadow-${shortCode})`}
          />

          {/* Inner Crest Border Accent */}
          <path
            d="M50 12 L82 23 C82 62 62 90 50 102 C38 90 18 62 18 23 Z"
            fill="none"
            stroke="#000000"
            strokeWidth="1.5"
            strokeOpacity="0.25"
          />

          {/* Crest Diagonal / Sash Accent */}
          <path
            d="M18 23 L82 85"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeOpacity="0.25"
          />

          {/* Team Shortcode / Monogram */}
          <text
            x="50"
            y="64"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize={fontSize * 2.2}
            fontFamily="ui-monospace, monospace"
            fontWeight="900"
            letterSpacing="-0.5px"
            className="select-none"
            style={{
              textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.5)',
            }}
          >
            {shortCode}
          </text>

          {/* Gold Star / Starlet on top of crest for elite clubs */}
          <polygon
            points="50,22 52,28 58,28 53,32 55,38 50,34 45,38 47,32 42,28 48,28"
            fill="#FFD700"
            stroke="#000000"
            strokeWidth="0.5"
            strokeOpacity="0.3"
          />
        </svg>
      )}
    </div>
  );
};
