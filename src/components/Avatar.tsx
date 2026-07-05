import React from 'react';

interface AvatarProps {
  avatar?: string;
  username?: string;
  sizeClass?: string;
  textClass?: string;
}

export default function Avatar({
  avatar,
  username,
  sizeClass = "w-10 h-10",
  textClass = "text-sm",
}: AvatarProps) {
  // If we have a base64 or URL image
  if (avatar && (avatar.startsWith('data:image/') || avatar.startsWith('http://') || avatar.startsWith('https://'))) {
    return (
      <img
        src={avatar}
        alt={username || "Avatar"}
        className={`${sizeClass} rounded-full object-cover border border-white/15 shrink-0`}
        referrerPolicy="no-referrer"
      />
    );
  }

  // If we have an emoji or preset character
  if (avatar && avatar.length <= 4) {
    return (
      <div className={`${sizeClass} rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0`}>
        <span className={textClass}>{avatar}</span>
      </div>
    );
  }

  // Fallback to first 2 letters of username or a default emoji
  const initials = username ? username.substring(0, 2).toUpperCase() : '🦁';
  return (
    <div className={`${sizeClass} rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black uppercase shrink-0`}>
      <span className={textClass}>{initials}</span>
    </div>
  );
}
