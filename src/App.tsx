import { useState, useEffect } from 'react'
import './App.css'
import { auth, db } from './firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  orderBy,
  updateDoc,
} from 'firebase/firestore'
import axios from 'axios'

function App() {
  const [tab, setTab] = useState<'people' | 'groups'>('people');
  const [persons, setPersons] = useState<{ id: string; name: string; notes: string; imageUrl?: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; title: string; personIds: string[] }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<{ personId: string; name: string }|null>(null);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<{ id: string; title: string; personIds: string[] }|null>(null);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editModal, setEditModal] = useState<null | { id: string; name: string; notes: string; imageUrl?: string }>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editUploadingImage, setEditUploadingImage] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<null | { id: string; name: string }>(null);

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // Persons listener
  useEffect(() => {
    if (!user) {
      setPersons([]);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'persons'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setPersons(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any))
      );
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Groups listener
  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }
    const q = query(collection(db, 'groups'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setGroups(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any))
      );
    });
    return () => unsub();
  }, [user]);

  // Add person
  const handleAddPerson = async () => {
    if (!user || !newName.trim()) return;
    await addDoc(collection(db, 'persons'), {
      uid: user.uid,
      name: newName.trim(),
      notes: newNotes.trim(),
      imageUrl: newImageUrl,
      createdAt: Date.now(),
    });
    setNewName('');
    setNewNotes('');
    setNewImageFile(null);
    setNewImageUrl('');
    setShowModal(false);
  };

  // Add group
  const handleAddGroup = async () => {
    if (!user || !newGroupTitle.trim()) return;
    await addDoc(collection(db, 'groups'), {
      uid: user.uid,
      title: newGroupTitle.trim(),
      personIds: [],
    });
    setNewGroupTitle('');
    setShowGroupModal(false);
  };

  // Assign person to groups
  const handleAssignPerson = async (personId: string, groupIds: string[]) => {
    // For each group, update personIds
    await Promise.all(groups.map(async (group) => {
      const inGroup = groupIds.includes(group.id);
      const alreadyIn = group.personIds.includes(personId);
      if (inGroup && !alreadyIn) {
        await updateDoc(doc(db, 'groups', group.id), {
          personIds: [...group.personIds, personId],
        });
      } else if (!inGroup && alreadyIn) {
        await updateDoc(doc(db, 'groups', group.id), {
          personIds: group.personIds.filter(id => id !== personId),
        });
      }
    }));
    setShowAssignModal(null);
  };

  const handleDeletePerson = async (id: string) => {
    await deleteDoc(doc(db, 'persons', id));
    // Remove from all groups
    await Promise.all(groups.map(async (group) => {
      if (group.personIds.includes(id)) {
        await updateDoc(doc(db, 'groups', group.id), {
          personIds: group.personIds.filter(pid => pid !== id),
        });
      }
    }));
  };

  const handleDeleteGroup = async (id: string) => {
    await deleteDoc(doc(db, 'groups', id));
    if (selectedGroup && selectedGroup.id === id) setSelectedGroup(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // Cloudinary upload
  const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewImageFile(file);
    setUploadingImage(true);
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    try {
      const response = await axios.post(url, formData);
      setNewImageUrl(response.data.secure_url);
    } catch (err) {
      alert('Image upload failed.');
      setNewImageUrl('');
    }
    setUploadingImage(false);
  };

  // Edit person
  const handleEditPerson = (person: { id: string; name: string; notes: string; imageUrl?: string }) => {
    setEditModal(person);
    setEditName(person.name);
    setEditNotes(person.notes);
    setEditImageUrl(person.imageUrl || '');
  };

  const handleUpdatePerson = async () => {
    if (!editModal || !editName.trim()) return;
    await updateDoc(doc(db, 'persons', editModal.id), {
      name: editName.trim(),
      notes: editNotes.trim(),
      imageUrl: editImageUrl,
    });
    setEditModal(null);
    setEditName('');
    setEditNotes('');
    setEditImageUrl('');
  };

  // Cloudinary upload for edit
  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditUploadingImage(true);
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    try {
      const response = await axios.post(url, formData);
      setEditImageUrl(response.data.secure_url);
    } catch (err) {
      alert('Image upload failed.');
    }
    setEditUploadingImage(false);
  };

  // Remove person from group
  const handleRemovePersonFromGroup = async (groupId: string, personId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const updatedPersonIds = group.personIds.filter(id => id !== personId);
    await updateDoc(doc(db, 'groups', groupId), {
      personIds: updatedPersonIds,
    });
    // Refresh selectedGroup state to trigger UI update
    if (selectedGroup && selectedGroup.id === groupId) {
      setSelectedGroup({ ...selectedGroup, personIds: updatedPersonIds });
    }
  };

  if (!user) {
    return (
      <div className="container">
        <h1>My Peeps</h1>
        <form className="auth-form" onSubmit={handleAuth}>
          <h2>{authMode === 'login' ? 'Login' : 'Register'}</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {authMode === 'login' ? 'Login' : 'Register'}
          </button>
          <div className="switch-auth">
            {authMode === 'login' ? (
              <span>
                New here?{' '}
                <button type="button" onClick={() => setAuthMode('register')} disabled={loading}>
                  Register
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button type="button" onClick={() => setAuthMode('login')} disabled={loading}>
                  Login
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    );
  }

  // Tabs
  return (
    <div className="container">
      <h1>My Peeps</h1>
      <button className="logout-btn" onClick={handleLogout}>Logout</button>
      <div className="tabs">
        <button className={tab === 'people' ? 'active' : ''} onClick={() => { setTab('people'); setSelectedGroup(null); }}>People</button>
        <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Groups</button>
      </div>
      {tab === 'people' && (
        <>
          {loading && <div>Loading...</div>}
          <ul className="person-list">
            {persons.length === 0 && !loading && <li>No persons added yet.</li>}
            {persons.map((person) => (
              <li key={person.id} className="person-item">
                {person.imageUrl && (
                  <img src={person.imageUrl} alt={person.name} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: '50%', marginRight: 12, verticalAlign: 'middle' }} />
                )}
                <strong onClick={() => setShowAssignModal({ personId: person.id, name: person.name })} style={{ cursor: 'pointer' }}>{person.name}</strong>
                {person.notes && <div className="person-notes">{person.notes}</div>}
                <button className="delete-btn" onClick={() => setDeleteConfirm({ id: person.id, name: person.name })} title="Delete">🗑️</button>
                <button className="delete-btn" style={{ color: '#333', marginLeft: 4 }} onClick={() => handleEditPerson(person)} title="Edit">✏️</button>
              </li>
            ))}
          </ul>
          <button className="add-btn" onClick={() => setShowModal(true)} title="Add person">＋</button>
        </>
      )}
      {tab === 'groups' && (
        <>
          <ul className="group-list">
            {groups.length === 0 && <li>No groups yet.</li>}
            {groups.map((group) => (
              <li key={group.id} className="group-item">
                <span className="group-title" onClick={() => setSelectedGroup(group)} style={{ cursor: 'pointer' }}>{group.title}</span>
                <button className="delete-btn" onClick={() => handleDeleteGroup(group.id)} title="Delete">🗑️</button>
              </li>
            ))}
          </ul>
          <button className="add-btn" onClick={() => setShowGroupModal(true)} title="Add group">＋</button>
          {selectedGroup && (
            <div className="group-detail">
              <h2>{selectedGroup.title}</h2>
              <ul className="person-list">
                {persons.filter(p => selectedGroup.personIds.includes(p.id)).map((person) => (
                  <li key={person.id} className="person-item">
                    <strong>{person.name}</strong>
                    {person.notes && <div className="person-notes">{person.notes}</div>}
                    <button className="delete-btn" title="Remove from group" onClick={() => handleRemovePersonFromGroup(selectedGroup.id, person.id)}>❌</button>
                  </li>
                ))}
                {persons.filter(p => selectedGroup.personIds.includes(p.id)).length === 0 && <li>No persons in this group.</li>}
              </ul>
            </div>
          )}
        </>
      )}
      {/* Add Person Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add a Person</h2>
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <textarea
              placeholder="Notes (optional)"
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={uploadingImage}
            />
            {uploadingImage && <div>Uploading image...</div>}
            {newImageUrl && <img src={newImageUrl} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '50%', marginTop: 8 }} />}
            <div className="modal-actions">
              <button onClick={handleAddPerson} disabled={!newName.trim() || uploadingImage}>Add</button>
              <button onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Add Group Modal */}
      {showGroupModal && (
        <div className="modal-backdrop" onClick={() => setShowGroupModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Add a Group</h2>
            <input
              type="text"
              placeholder="Group Title"
              value={newGroupTitle}
              onChange={e => setNewGroupTitle(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button onClick={handleAddGroup} disabled={!newGroupTitle.trim()}>Add</button>
              <button onClick={() => setShowGroupModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Assign Person to Groups Modal */}
      {showAssignModal && (
        <div className="modal-backdrop" onClick={() => setShowAssignModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Assign {showAssignModal.name} to Groups</h2>
            <form onSubmit={e => { e.preventDefault(); handleAssignPerson(showAssignModal.personId, Array.from(new FormData(e.currentTarget)).map(([k]) => k)); }}>
              {groups.map(group => (
                <label key={group.id} style={{ display: 'block', margin: '0.5em 0' }}>
                  <input
                    type="checkbox"
                    name={group.id}
                    defaultChecked={group.personIds.includes(showAssignModal.personId)}
                  />
                  {group.title}
                </label>
              ))}
              <div className="modal-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={() => setShowAssignModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Person Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Edit Person</h2>
            <input
              type="text"
              placeholder="Name"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              autoFocus
            />
            <textarea
              placeholder="Notes (optional)"
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
            />
            <input
              type="file"
              accept="image/*"
              onChange={handleEditImageChange}
              disabled={editUploadingImage}
            />
            {editUploadingImage && <div>Uploading image...</div>}
            {editImageUrl && <img src={editImageUrl} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '50%', marginTop: 8 }} />}
            <div className="modal-actions">
              <button onClick={handleUpdatePerson} disabled={!editName.trim() || editUploadingImage}>Save</button>
              <button onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Person Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Delete {deleteConfirm.name}?</h2>
            <p>Are you sure you want to delete this person? This cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={async () => { await handleDeletePerson(deleteConfirm.id); setDeleteConfirm(null); }}>Delete</button>
              <button onClick={() => setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App
