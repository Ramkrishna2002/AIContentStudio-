/**
 * AI Content Studio - Backup System
 * -----------------------------------------
 * Snapshots the entire acs_* LocalStorage namespace into a backup
 * record (kept up to LIMITS.MAX_BACKUPS, oldest trimmed first),
 * with restore, delete, and file export/import for taking a backup
 * outside the browser entirely.
 */

const BackupSystem = (() => {

  const KEY = window.AppConfig.STORAGE_KEYS.BACKUPS;
  const MAX = window.AppConfig.LIMITS.MAX_BACKUPS;

  function getAll() {
    return window.StorageEngine.get(KEY, []);
  }

  function createBackup(label) {
    const data = window.StorageEngine.exportAll("acs_");
    // never snapshot the backup list itself inside a backup — avoids unbounded recursive growth
    delete data[KEY];

    const backups = getAll();
    const backup = {
      id: window.Database.generateId(window.AppConfig.ID_PREFIXES.BACKUP),
      label: label || `Backup ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      data
    };
    backups.push(backup);
    const trimmed = backups.length > MAX ? backups.slice(backups.length - MAX) : backups;
    window.StorageEngine.set(KEY, trimmed);
    return backup;
  }

  function restoreBackup(backupId) {
    const backup = getAll().find(b => b.id === backupId);
    if (!backup) throw new Error(`Backup not found: ${backupId}`);
    window.StorageEngine.importAll(backup.data);
    return true;
  }

  function deleteBackup(backupId) {
    const backups = getAll().filter(b => b.id !== backupId);
    window.StorageEngine.set(KEY, backups);
  }

  function exportBackupToFile(backupId) {
    const backup = getAll().find(b => b.id === backupId);
    if (!backup) throw new Error(`Backup not found: ${backupId}`);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backup.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importBackupFromFileText(fileText) {
    const parsed = JSON.parse(fileText);
    if (!parsed || !parsed.data) throw new Error("This file doesn't look like a valid AI Content Studio backup.");
    const backups = getAll();
    // re-id on import so it never collides with an existing backup entry
    const imported = { ...parsed, id: window.Database.generateId(window.AppConfig.ID_PREFIXES.BACKUP) };
    backups.push(imported);
    window.StorageEngine.set(KEY, backups);
    return imported;
  }

  return { getAll, createBackup, restoreBackup, deleteBackup, exportBackupToFile, importBackupFromFileText };

})();

window.BackupSystem = BackupSystem;
