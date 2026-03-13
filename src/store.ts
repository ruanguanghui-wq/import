import { useState, useEffect } from "react";
import { Order, Quotation, Product } from "./types";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  or,
  writeBatch,
} from "firebase/firestore";

// Helper to remove undefined values which Firestore doesn't support
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)]),
    );
  }
  return obj;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
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
        const email = firebaseUser.email;
        if (!email) {
          await signOut(auth);
          setUser(null);
          setToken(null);
          setLoading(false);
          return;
        }

        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);

        const isAdminEmail = email === "ruanguanghui@gmail.com";

        let role: "admin" | "user" = isAdminEmail ? "admin" : "user";
        try {
          // Check allowed_emails
          const allowedEmailDoc = await getDoc(doc(db, "allowed_emails", email));

          if (!allowedEmailDoc.exists() && !isAdminEmail) {
            // Not allowed
            await signOut(auth);
            setUser(null);
            setToken(null);
            setLoading(false);
            return;
          }

          if (allowedEmailDoc.exists()) {
            role = allowedEmailDoc.data().role || "user";
          }
        } catch (err) {
          console.error("Error checking allowed_emails:", err);
          if (!isAdminEmail) {
            // If we can't verify and they aren't admin, deny access for security
            await signOut(auth);
            setUser(null);
            setToken(null);
            setLoading(false);
            return;
          }
        }

        let username = firebaseUser.displayName || email.split("@")[0];

        try {
          // Fetch user doc to sync or create
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

          if (userDoc.exists()) {
            // Update role if it changed in allowed_emails
            if (userDoc.data().role !== role) {
              await setDoc(
                doc(db, "users", firebaseUser.uid),
                { role },
                { merge: true },
              );
            }
            username = userDoc.data().username || username;
          } else {
            // Create user doc
            await setDoc(doc(db, "users", firebaseUser.uid), {
              username,
              role,
              email: email,
            });
          }
        } catch (err) {
          console.error("Error syncing user with Firestore:", err);
          // Continue with default username and role if Firestore fails
        }

        setUser({
          id: firebaseUser.uid,
          username,
          email,
          role,
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

export function useUsers(user: User | null, token: string | null) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "admin" || !db) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const usersData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as User[];
        setUsers(usersData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching users:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const addUser = async (userData: { email: string; role: string; username?: string }) => {
    if (!user || user.role !== "admin" || !db) return;
    try {
      const id = crypto.randomUUID();
      await setDoc(doc(db, "users", id), removeUndefined({ ...userData, id }));
      await setDoc(doc(db, "allowed_emails", userData.email), removeUndefined({ role: userData.role }));
    } catch (error) {
      console.error("Error adding user:", error);
      throw error;
    }
  };

  const updateUser = async (id: string, userData: { email: string; role: string; username?: string }) => {
    if (!user || user.role !== "admin" || !db) return;
    try {
      await setDoc(doc(db, "users", id), removeUndefined(userData), { merge: true });
      await setDoc(doc(db, "allowed_emails", userData.email), removeUndefined({ role: userData.role }), { merge: true });
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  };

  const deleteUser = async (id: string) => {
    if (!user || user.role !== "admin" || !db) return;
    try {
      // Find user to get email for allowed_emails deletion
      const userDoc = await getDoc(doc(db, "users", id));
      if (userDoc.exists()) {
        const email = userDoc.data().email;
        if (email) {
          await deleteDoc(doc(db, "allowed_emails", email));
        }
      }
      await deleteDoc(doc(db, "users", id));
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  };

  return { users, loading, addUser, updateUser, deleteUser, refresh: () => {} };
}

export function useQuotations(user: User | null, token: string | null) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setQuotations([]);
      setLoading(false);
      return;
    }

    let q;
    if (user.role === "admin") {
      q = query(collection(db, "quotations"));
    } else {
      q = query(collection(db, "quotations"), where("customerId", "==", user.id));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const quotationsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Quotation[];
        setQuotations(quotationsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching quotations:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const addQuotation = async (quotation: Quotation) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, "quotations", quotation.id), removeUndefined(quotation));
    } catch (error) {
      console.error("Error adding quotation:", error);
      throw error;
    }
  };

  const updateQuotation = async (updatedQuotation: Quotation) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, "quotations", updatedQuotation.id), removeUndefined(updatedQuotation), { merge: true });
    } catch (error) {
      console.error("Error updating quotation:", error);
      throw error;
    }
  };

  const deleteQuotation = async (id: string) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, "quotations", id));
    } catch (error) {
      console.error("Error deleting quotation:", error);
      throw error;
    }
  };

  const bulkUpdateQuotations = async (updatedQuotations: Quotation[]) => {
    if (!user || !db || updatedQuotations.length === 0) return;
    try {
      const batch = writeBatch(db);
      updatedQuotations.forEach((q) => {
        batch.set(doc(db, "quotations", q.id), removeUndefined(q), { merge: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error bulk updating quotations:", error);
      throw error;
    }
  };

  return {
    quotations,
    loading,
    addQuotation,
    updateQuotation,
    deleteQuotation,
    bulkUpdateQuotations,
    refresh: () => {},
  };
}

export function useOrders(user: User | null, token: string | null) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setOrders([]);
      setLoading(false);
      return;
    }

    let q;
    if (user.role === "admin") {
      q = query(collection(db, "orders"));
    } else {
      q = query(collection(db, "orders"), where("userId", "==", user.id));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ordersData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Order[];
        setOrders(ordersData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching orders:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const addOrder = async (order: Order) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, "orders", order.id), removeUndefined(order));
    } catch (error) {
      console.error("Error adding order:", error);
      throw error;
    }
  };

  const updateOrder = async (updatedOrder: Order) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, "orders", updatedOrder.id), removeUndefined(updatedOrder), { merge: true });
    } catch (error) {
      console.error("Error updating order:", error);
      throw error;
    }
  };

  const deleteOrder = async (id: string) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, "orders", id));
    } catch (error) {
      console.error("Error deleting order:", error);
      throw error;
    }
  };

  const bulkUpdateOrders = async (updatedOrders: Order[]) => {
    if (!user || !db || updatedOrders.length === 0) return;
    try {
      const batch = writeBatch(db);
      updatedOrders.forEach((o) => {
        batch.set(doc(db, "orders", o.id), removeUndefined(o), { merge: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error bulk updating orders:", error);
      throw error;
    }
  };

  return { orders, loading, addOrder, updateOrder, deleteOrder, bulkUpdateOrders, refresh: () => {} };
}

export function useProducts(user: User | null, token: string | null) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "products"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const productsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Product[];
        setProducts(productsData);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching products:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const addProduct = async (product: Product) => {
    if (!user || user.role !== "admin" || !db) return;
    try {
      await setDoc(doc(db, "products", product.id), removeUndefined(product));
    } catch (error) {
      console.error("Error adding product:", error);
      throw error;
    }
  };

  const updateProduct = async (product: Product) => {
    if (!user || user.role !== "admin" || !db) return;
    try {
      await setDoc(doc(db, "products", product.id), removeUndefined(product), { merge: true });
    } catch (error) {
      console.error("Error updating product:", error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (!user || user.role !== "admin" || !db) return;
    try {
      await deleteDoc(doc(db, "products", id));
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  };

  const bulkAddProducts = async (newProducts: Product[]) => {
    if (!user || user.role !== "admin" || !db || newProducts.length === 0) return;
    try {
      const batch = writeBatch(db);
      newProducts.forEach((p) => {
        batch.set(doc(db, "products", p.id), removeUndefined(p));
      });
      await batch.commit();
    } catch (error) {
      console.error("Error bulk adding products:", error);
      throw error;
    }
  };

  const bulkUpdateProducts = async (updatedProducts: Product[]) => {
    if (!user || user.role !== "admin" || !db || updatedProducts.length === 0) return;
    try {
      const batch = writeBatch(db);
      updatedProducts.forEach((p) => {
        batch.set(doc(db, "products", p.id), removeUndefined(p), { merge: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error bulk updating products:", error);
      throw error;
    }
  };

  const bulkDeleteProducts = async (ids: string[]) => {
    if (!user || user.role !== "admin" || !db || ids.length === 0) return;
    try {
      const batch = writeBatch(db);
      ids.forEach((id) => {
        batch.delete(doc(db, "products", id));
      });
      await batch.commit();
    } catch (error) {
      console.error("Error bulk deleting products:", error);
      throw error;
    }
  };

  return { 
    products, 
    loading, 
    addProduct, 
    updateProduct, 
    deleteProduct, 
    bulkAddProducts,
    bulkUpdateProducts,
    bulkDeleteProducts,
    refresh: () => {} 
  };
}
