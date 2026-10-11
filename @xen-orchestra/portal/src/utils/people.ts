/** "camille.martin@helios.example" → "Camille Martin" */
export function displayName(account: string) {
  const local = account.split('@')[0] ?? account
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function firstName(account: string) {
  return displayName(account).split(' ')[0]
}

export function initialsOf(account: string) {
  return displayName(account)
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}
