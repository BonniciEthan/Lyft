import { nameInitial } from '../lib/lifterProfileStore.js';

/** Circular profile photo, or the name's initial when there is no photo. Fills its parent. */
export function Avatar({ profile }) {
  if (profile?.avatarDataUrl) return <img className="avatar-img" src={profile.avatarDataUrl} alt="" draggable={false} />;
  return (
    <span className="avatar-initial" aria-hidden>
      {nameInitial(profile?.displayName)}
    </span>
  );
}

/** Top-right button that opens the Profile page. */
export function ProfileButton({ profile, onClick, active = false }) {
  return (
    <button type="button" className={`profile-btn ${active ? 'is-active' : ''}`} onClick={onClick} aria-label="Open profile">
      <Avatar profile={profile} />
    </button>
  );
}
