import { useState, useEffect } from 'react';
import { Order } from './types';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

// Helper to remove undefined values which Firestore doesn't support
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
        
        // Fetch user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        let role: 'admin' | 'user' = 'user';
        let username = firebaseUser.email?.split('@')[0] || 'User';
        
        const isAdminEmail = 
          firebaseUser.email === 'admin@example.com' || 
          firebaseUser.email === 'ruanguanghui@gmail.com' ||
          firebaseUser.email === 'ruanguanghuigmailcom@example.com';
        
        if (userDoc.exists()) {
          role = userDoc.data().role;
          username = userDoc.data().username || username;
          
          // Force admin role if email matches
          if (isAdminEmail && role !== 'admin') {
            role = 'admin';
            await setDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' }, { merge: true });
          }
        } else {
          // Check if admin
          if (isAdminEmail) {
            role = 'admin';
            username = 'admin';
          }
          // Create user doc
          await setDoc(doc(db, 'users', firebaseUser.uid), {
            username,
            role,
            email: firebaseUser.email
          });
        }
        
        setUser({
          id: firebaseUser.uid,
          username,
          role
        });
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = (newToken: string, newUser: User) => {
    // Handled by onAuthStateChanged
  };

  const logout = async () => {
    if (auth) {
      await signOut(auth);
    }
  };

  return { user, token, loading, login, logout };
}

export function useOrders(user: User | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const ordersRef = collection(db, 'orders');
    let q;
    
    if (user.role === 'admin') {
      q = query(ordersRef);
    } else {
      q = query(ordersRef, where('userId', '==', user.id));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders: Order[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Handle legacy data format if needed
        if (data.data && typeof data.data === 'string') {
           try {
             fetchedOrders.push(JSON.parse(data.data));
           } catch (e) {
             console.error("Error parsing order data", e);
           }
        } else {
           fetchedOrders.push(data as Order);
        }
      });
      setOrders(fetchedOrders);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching orders:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const addOrder = async (order: Order) => {
    if (!user || !db) return;
    try {
      const orderToSave = removeUndefined({
        ...order,
        userId: user.id,
        customerName: user.role === 'admin' ? order.customerName : user.username
      });
      await setDoc(doc(db, 'orders', order.id), orderToSave);
    } catch (error) {
      console.error('Error adding order:', error);
      throw error;
    }
  };

  const updateOrder = async (updatedOrder: Order) => {
    if (!user || !db) return;
    try {
      const orderToSave = removeUndefined(updatedOrder);
      await setDoc(doc(db, 'orders', updatedOrder.id), orderToSave);
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  };

  const deleteOrder = async (id: string) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'orders', id));
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  };

  return { orders, loading, addOrder, updateOrder, deleteOrder };
}
