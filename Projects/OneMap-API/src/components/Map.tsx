import React, { useState, useEffect, useRef } from 'react';
import './Map.css';
import { token } from '../token'
import L from "leaflet"
import "leaflet/dist/leaflet.css";

interface SearchResult {
    ADDRESS: string;
    LATITUDE: string;
    LONGITUDE: string;
}

interface GeocodeInfo {
    BLOCK: string;
    ROAD: string;
    POSTALCODE: string;
}

const customIcon = L.icon({
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png", // Custom marker image
    iconSize: [25, 41],  // Default Leaflet size
    iconAnchor: [12, 41], // Center bottom anchor
    popupAnchor: [1, -34],
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
    shadowSize: [41, 41]
});

const Map = () => {
    const [query, setQuery] = useState("");  
    const [results, setResults] = useState<SearchResult[]>([]);  
    const [loading, setLoading] = useState(false); // Loading state
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstance = useRef<L.Map | null>(null); // Store the map instance
    const markerInstance = useRef<L.Marker | null>(null); // Store the marker instance

    // Prevent map clicks while loading
    useEffect(() => {
        if (mapInstance.current) {
            if (loading) {
                mapInstance.current.dragging.disable();
                mapInstance.current.touchZoom.disable();
                mapInstance.current.doubleClickZoom.disable();
                mapInstance.current.scrollWheelZoom.disable();
            } else {
                mapInstance.current.dragging.enable();
                mapInstance.current.touchZoom.enable();
                mapInstance.current.doubleClickZoom.enable();
                mapInstance.current.scrollWheelZoom.enable();
            }
        }
    }, [loading]);

    // Provide buffer time between query updates and API calls
    // Prevent additional API calls while loading
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (!loading) search(query);
        }, 500); 
    
        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    // Function to dynamically load the script
    const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
        });
    };

    // Function to convert latlng to address
    const reverse_geocode = (lat:number, lng:number) => {
        const geocode_url = `https://www.onemap.gov.sg/api/public/revgeocode?location=${lat},${lng}&buffer=500&addressType=All&otherFeatures=N`;

        fetch(geocode_url, {
            method: 'GET',
            headers: {
              'Authorization': `${token}`,  // API token for authorization
            }
          }).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            };
            return response.json();
        })
        .then(data => {    
            if (data.GeocodeInfo && data.GeocodeInfo.length > 0) {
                // Find the first valid address that does not have "NIL" as BLOCK, ROAD, or POSTALCODE
                const validAddress = data.GeocodeInfo.find((item:GeocodeInfo) => 
                    item.BLOCK !== "NIL" && item.ROAD !== "NIL" && item.POSTALCODE !== "NIL"
                );
    
                if (validAddress) {
                    const address = `${validAddress.BLOCK} ${validAddress.ROAD} SINGAPORE ${validAddress.POSTALCODE}`;
                    setQuery(() => {
                        load_map(address, lat, lng);  // Call load_map with the updated address
                        return address;
                    });
                } else {
                    setQuery("Unknown Location");
                }
            } else {
                setQuery("Unknown Location");
            }
        })
        .catch(error => console.error('Error fetching data:', error));
    }

    // Function to fetch search results
    const search = (query: string) => {
        if (!query || query.trim() === "") {
            setResults([]);
            return;
        }

        const searchUrl = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${query}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;

        fetch(searchUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                setResults(data.results || [])
            })
            .catch(error => console.error('Error fetching data:', error));
    };

    // Function to handle address selection
    const handleSelect = async (address: string, lat: number, lng: number) => {
        if (loading) return; // Prevent action while loading
    
        setLoading(true);
        setQuery(address);
        
        await new Promise((resolve) => {
            setResults([]); // Clear results first
            setTimeout(() => resolve(null), 300); // Small delay to ensure query is updated
        });
    
        load_map(address, lat, lng);
        setLoading(false); // Re-enable interactions
    };

    // Function to generate map
    const load_map = (address:string, lat: number, lng: number) => {
        loadScript("https://www.onemap.gov.sg/web-assets/libs/leaflet/onemap-leaflet.js")
            .then(() => {
                if (mapRef.current) {
                    
                    if (!mapInstance.current) {
                        // If map doesn't exist, create it
                        mapInstance.current = L.map(mapRef.current, {
                            center: [lat, lng],
                            zoom: 16,
                        });

                        const basemap = L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', {
                            detectRetina: true,
                            maxZoom: 19,
                            minZoom: 11,
                            attribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'
                        });

                        basemap.addTo(mapInstance.current);

                        mapInstance.current.on("click", (e: L.LeafletMouseEvent) => {
                            reverse_geocode(e.latlng.lat, e.latlng.lng);
                            load_map(query, e.latlng.lat, e.latlng.lng);
                            return;
                        })

                    } else {
                        // If map already exists, update its center
                        mapInstance.current.setView([lat, lng]);
                    }

                    if (markerInstance.current) {
                        markerInstance.current.setLatLng([lat, lng]).setIcon(customIcon).bindPopup(address); // Move marker
                    } else {
                        // Create a new marker if none exists
                        markerInstance.current = L.marker([lat, lng], {icon: customIcon}).addTo(mapInstance.current).bindPopup(address).openPopup();
                    }
                }
            })
            .catch(err => console.error("Failed to load OneMap Leaflet script:", err));
    };


    return (
        <div className='main-div'>
            <div className='search-div'>
                <form action="">
                    <input
                        type="text" 
                        className="search-input"
                        placeholder="Search Location" 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button 
                        type='button'
                        onClick={() => {
                            if (results.length > 0) {
                                const firstResult = results[0];
                                handleSelect(firstResult.ADDRESS, Number(firstResult.LATITUDE), Number(firstResult.LONGITUDE));
                            }
                        }}
                    >
                        Search
                    </button>
                </form>

                {results.length > 0 && (
                    <ul>
                        {results.map((item, index) => (
                            <li key={index}>
                                <button onClick={() => handleSelect(item.ADDRESS, Number(item.LATITUDE), Number(item.LONGITUDE))}>
                                    {item.ADDRESS}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className='minimap'>
                <h1 id="header" style={{fontSize: "20px"}}>OneMap Basemap (XYZ Tile Layer)</h1>
                <div id="mapdiv" ref={mapRef} style={{ width: "450px", height: "450px" }}></div>
            </div>
        </div>
    );
};

export default Map;
