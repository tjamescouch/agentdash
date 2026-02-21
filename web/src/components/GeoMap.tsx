import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Connection {
  agent_id: string;
  display_name?: string;
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  connected_at?: number;
  ip?: string;
}

export function GeoMap() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fetch connections from API
  useEffect(() => {
    const fetchConnections = async () => {
      try {
        const res = await fetch('https://agentchat-server.fly.dev/api/connections');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        // Filter connections with valid geo data
        const validConnections = (data.connections || []).filter(
          (c: Connection) => c.lat !== undefined && c.lon !== undefined
        );
        
        setConnections(validConnections);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch connections');
      }
    };

    fetchConnections();
    const interval = setInterval(fetchConnections, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Update markers when connections change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    connections.forEach(conn => {
      if (!conn.lat || !conn.lon || !mapRef.current) return;

      const marker = L.circleMarker([conn.lat, conn.lon], {
        radius: 8,
        fillColor: '#3b82f6',
        fillOpacity: 0.7,
        color: '#1e40af',
        weight: 2,
      });

      const displayName = conn.display_name || conn.agent_id || 'Unknown';
      const location = [conn.city, conn.country].filter(Boolean).join(', ') || 'Unknown';
      const connectedTime = conn.connected_at
        ? new Date(conn.connected_at).toLocaleString()
        : 'Unknown';

      marker.bindPopup(`
        <div style="font-family: monospace; font-size: 12px;">
          <strong>${displayName}</strong><br/>
          <span style="color: #666;">${location}</span><br/>
          <span style="font-size: 10px;">Connected: ${connectedTime}</span>
        </div>
      `);

      marker.addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [connections]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#fff',
      }}>
        <strong>Global Agent Connections</strong>
        {error && <span style={{ color: '#ef4444', marginLeft: '16px' }}>Error: {error}</span>}
        <span style={{ color: '#6b7280', marginLeft: '16px' }}>
          {connections.length} active connection{connections.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div ref={containerRef} style={{ flex: 1, background: '#0a0a0a' }} />
    </div>
  );
}
