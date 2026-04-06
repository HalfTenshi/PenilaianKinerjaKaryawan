# Firestore Security Rules

Copy rules berikut ke Firebase Console → Firestore Database → Rules

```rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function hasUserDoc() {
      return signedIn() &&
        exists(/databases/$(database)/documents/pengguna/$(request.auth.uid));
    }

    function myRole() {
      return hasUserDoc()
        ? get(/databases/$(database)/documents/pengguna/$(request.auth.uid)).data.role
        : null;
    }

    function myKaryawanId() {
      return hasUserDoc()
        ? get(/databases/$(database)/documents/pengguna/$(request.auth.uid)).data.karyawanId
        : null;
    }

    function isAdmin() {
      return myRole() == 'admin';
    }

    function isKaryawan() {
      return myRole() == 'karyawan';
    }

    function isOwnUser(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function isOwnKaryawanId(karyawanId) {
      return signedIn() &&
        (
          request.auth.uid == karyawanId ||
          myKaryawanId() == karyawanId
        );
    }

    function isValidRole(role) {
      return role == 'admin' || role == 'karyawan';
    }

    function isValidPeriodeStatus(status) {
      return status == 'aktif' || status == 'ditutup';
    }

    function isValidPenilaianStatus(status) {
      return status == 'draft' || status == 'dikirim' || status == 'dinilai';
    }

    function isValidAttendanceStatus(status) {
      return status == 'hadir' || status == 'sakit' || status == 'izin';
    }

    match /pengguna/{uid} {
      allow read: if signedIn() && (isOwnUser(uid) || isAdmin());

      allow create: if isOwnUser(uid)
        && request.resource.data.keys().hasOnly([
          'uid',
          'email',
          'role',
          'nama',
          'karyawanId',
          'statusAktif',
          'fotoProfilUrl',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.uid == uid
        && request.resource.data.email is string
        && request.resource.data.role == 'karyawan'
        && request.resource.data.karyawanId == uid;

      allow update: if isAdmin() || (
        isOwnUser(uid)
        && request.resource.data.uid == resource.data.uid
        && request.resource.data.email == resource.data.email
        && request.resource.data.role == resource.data.role
        && request.resource.data.karyawanId == resource.data.karyawanId
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'nama',
          'fotoProfilUrl',
          'statusAktif',
          'updatedAt'
        ])
      );

      allow delete: if isAdmin();
    }

    match /karyawan/{karyawanId} {
      allow read: if signedIn() && (isAdmin() || isOwnKaryawanId(karyawanId));

      allow create: if isAdmin() || (
        isOwnKaryawanId(karyawanId)
        && request.resource.data.keys().hasOnly([
          'id',
          'nama',
          'nip',
          'bagian',
          'jabatan',
          'statusAktif',
          'createdAt'
        ])
        && request.resource.data.id == karyawanId
      );

      allow update: if isAdmin() || (
        isOwnKaryawanId(karyawanId)
        && request.resource.data.id == resource.data.id
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'nama',
          'updatedAt'
        ])
      );

      allow delete: if isAdmin();
    }

    match /periode_penilaian/{periodeId} {
      allow read: if signedIn();

      allow create, update, delete: if isAdmin()
        && request.resource.data.status is string
        && isValidPeriodeStatus(request.resource.data.status);
    }

    match /kriteria_penilaian/{kriteriaId} {
      allow read: if signedIn();

      allow create, update, delete: if isAdmin();
    }

    match /penilaian_kinerja/{penilaianId} {
      allow read: if signedIn() &&
        (
          isAdmin() ||
          resource.data.karyawanId == myKaryawanId() ||
          resource.data.karyawanId == request.auth.uid
        );

      allow create: if isKaryawan()
        && request.resource.data.keys().hasOnly([
          'id',
          'karyawanId',
          'periodeId',
          'status',
          'nilaiKaryawan',
          'nilaiAdmin',
          'catatanKaryawan',
          'catatanAdmin',
          'totalNilai',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.id == penilaianId
        && isOwnKaryawanId(request.resource.data.karyawanId)
        && request.resource.data.status == 'draft';

      // karyawan edit draft
      allow update: if isKaryawan()
        && isOwnKaryawanId(resource.data.karyawanId)
        && resource.data.status == 'draft'
        && request.resource.data.id == resource.data.id
        && request.resource.data.karyawanId == resource.data.karyawanId
        && request.resource.data.periodeId == resource.data.periodeId
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.nilaiAdmin == resource.data.nilaiAdmin
        && request.resource.data.catatanAdmin == resource.data.catatanAdmin
        && request.resource.data.totalNilai == resource.data.totalNilai
        && request.resource.data.status == 'draft'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'nilaiKaryawan',
          'catatanKaryawan',
          'updatedAt'
        ]);

      // karyawan submit draft -> dikirim
      allow update: if isKaryawan()
        && isOwnKaryawanId(resource.data.karyawanId)
        && resource.data.status == 'draft'
        && request.resource.data.id == resource.data.id
        && request.resource.data.karyawanId == resource.data.karyawanId
        && request.resource.data.periodeId == resource.data.periodeId
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.nilaiAdmin == resource.data.nilaiAdmin
        && request.resource.data.catatanAdmin == resource.data.catatanAdmin
        && request.resource.data.totalNilai == resource.data.totalNilai
        && request.resource.data.status == 'dikirim'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'nilaiKaryawan',
          'catatanKaryawan',
          'status',
          'updatedAt'
        ]);

      // admin evaluasi / revisi evaluasi
      allow update: if isAdmin()
        && request.resource.data.id == resource.data.id
        && request.resource.data.karyawanId == resource.data.karyawanId
        && request.resource.data.periodeId == resource.data.periodeId
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.nilaiKaryawan == resource.data.nilaiKaryawan
        && request.resource.data.catatanKaryawan == resource.data.catatanKaryawan
        && request.resource.data.status == 'dinilai'
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'nilaiAdmin',
          'catatanAdmin',
          'totalNilai',
          'status',
          'updatedAt'
        ]);

      allow delete: if isAdmin();
    }

    match /absensi/{absensiId} {
      allow read: if signedIn() &&
        (
          isAdmin() ||
          resource.data.karyawanId == myKaryawanId() ||
          resource.data.karyawanId == request.auth.uid
        );

      allow create: if isAdmin() || (
        isOwnKaryawanId(request.resource.data.karyawanId)
        && request.resource.data.keys().hasOnly([
          'id',
          'karyawanId',
          'tanggal',
          'statusKehadiran',
          'createdAt',
          'updatedAt'
        ])
        && request.resource.data.id == absensiId
        && isValidAttendanceStatus(request.resource.data.statusKehadiran)
      );

      allow update: if isAdmin() || (
        isOwnKaryawanId(resource.data.karyawanId)
        && request.resource.data.id == resource.data.id
        && request.resource.data.karyawanId == resource.data.karyawanId
        && request.resource.data.tanggal == resource.data.tanggal
        && request.resource.data.createdAt == resource.data.createdAt
        && isValidAttendanceStatus(request.resource.data.statusKehadiran)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'statusKehadiran',
          'updatedAt'
        ])
      );

      allow delete: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
