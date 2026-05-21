import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { isFarmerUser } from '../utils/farmAccess.js';

const FarmAccessContext = createContext(null);

export function FarmAccessProvider({ children }) {
  const { isAuthenticated, sessionReady, user } = useAuth();
  const [farmAccessReady, setFarmAccessReady] = useState(false);
  const [farmCount, setFarmCount] = useState(0);
  const [hasRegisteredFarm, setHasRegisteredFarm] = useState(true);
  const isFarmer = isFarmerUser(user);

  const applyFarmList = useCallback((farms) => {
    const nextFarms = Array.isArray(farms) ? farms : [];
    setFarmCount(nextFarms.length);
    setHasRegisteredFarm(nextFarms.length > 0);
    return nextFarms;
  }, []);

  const refreshFarmAccess = useCallback(async () => {
    if (!sessionReady) return [];

    if (!isAuthenticated || !isFarmer) {
      setFarmCount(0);
      setHasRegisteredFarm(true);
      setFarmAccessReady(true);
      return [];
    }

    try {
      const { data } = await api.get('/farms');
      const nextFarms = applyFarmList(data);
      setFarmAccessReady(true);
      return nextFarms;
    } catch {
      // Fail open on transient API issues so existing farmers are not accidentally locked out.
      setFarmCount(0);
      setHasRegisteredFarm(true);
      setFarmAccessReady(true);
      return [];
    }
  }, [applyFarmList, isAuthenticated, isFarmer, sessionReady]);

  useEffect(() => {
    let active = true;

    async function syncFarmAccess() {
      if (!sessionReady) {
        setFarmAccessReady(false);
        return;
      }

      if (!isAuthenticated || !isFarmer) {
        setFarmCount(0);
        setHasRegisteredFarm(true);
        setFarmAccessReady(true);
        return;
      }

      setFarmAccessReady(false);

      try {
        const { data } = await api.get('/farms');
        if (!active) return;
        applyFarmList(data);
      } catch {
        if (!active) return;
        setFarmCount(0);
        setHasRegisteredFarm(true);
      } finally {
        if (active) {
          setFarmAccessReady(true);
        }
      }
    }

    void syncFarmAccess();

    return () => {
      active = false;
    };
  }, [applyFarmList, isAuthenticated, isFarmer, sessionReady, user?.id]);

  const value = useMemo(
    () => ({
      farmAccessReady,
      farmCount,
      hasRegisteredFarm,
      isFarmer,
      isFarmRegistrationRequired: isFarmer && farmAccessReady && !hasRegisteredFarm,
      refreshFarmAccess,
    }),
    [farmAccessReady, farmCount, hasRegisteredFarm, isFarmer, refreshFarmAccess]
  );

  return <FarmAccessContext.Provider value={value}>{children}</FarmAccessContext.Provider>;
}

export function useFarmAccess() {
  const value = useContext(FarmAccessContext);
  if (!value) {
    throw new Error('useFarmAccess must be used within a FarmAccessProvider.');
  }
  return value;
}
