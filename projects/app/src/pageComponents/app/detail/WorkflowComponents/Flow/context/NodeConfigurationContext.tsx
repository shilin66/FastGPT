import React, {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';

type NodeConfigurationContextValue = {
  readonly host: HTMLDivElement | null;
  readonly activeNodeId: string | undefined;
  readonly setHost: (host: HTMLDivElement | null) => void;
  readonly setActiveNodeId: (nodeId: string | undefined) => void;
};

const NodeConfigurationContext = createContext<NodeConfigurationContextValue>({
  host: null,
  activeNodeId: undefined,
  setHost: () => undefined,
  setActiveNodeId: () => undefined
});

export const NodeConfigurationProvider = ({ children }: PropsWithChildren) => {
  const [host, setHostState] = useState<HTMLDivElement | null>(null);
  const [activeNodeId, setActiveNodeIdState] = useState<string>();
  const setHost = useCallback((nextHost: HTMLDivElement | null) => {
    setHostState(nextHost);
  }, []);
  const setActiveNodeId = useCallback((nodeId: string | undefined) => {
    setActiveNodeIdState(nodeId);
  }, []);
  const value = useMemo(
    () => ({ host, activeNodeId, setHost, setActiveNodeId }),
    [activeNodeId, host, setActiveNodeId, setHost]
  );

  return (
    <NodeConfigurationContext.Provider value={value}>{children}</NodeConfigurationContext.Provider>
  );
};

export const useNodeConfiguration = () => useContext(NodeConfigurationContext);
