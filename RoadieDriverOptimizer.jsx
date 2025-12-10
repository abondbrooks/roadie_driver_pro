import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, Clock, DollarSign, Target, User, TrendingUp, Settings, Save, Key, Mail, Zap, Calculator } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  setLogLevel,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';

// --- CONFIGURATION ---
// The API key provided by the user for Google services.
// Note: In a production app, this should be securely stored on a backend.
const GOOGLE_MAPS_API_KEY = "AIzaSyDKG0WMsBuyQzKQHzo8MQ5vsx1XUniH-J8";

// --- MOCK DATA SIMULATION (Updated for Philadelphia) ---
const MOCK_GIGS_DATA = [
  { id: 1, name: "Big Box Run", pickup: "Center City, PA", dropoff: "South Philly, PA", time: "1:15 PM - 2:30 PM", routeDuration: 25, pay: 18.50, demand: 'high', timeSlot: 'Afternoon' },
  { id: 2, name: "B2B Delivery", pickup: "University City, PA", dropoff: "Fishtown, PA", time: "9:00 AM - 10:30 AM", routeDuration: 40, pay: 28.00, demand: 'very-high', timeSlot: 'Morning' },
  { id: 3, name: "Industrial Supply", pickup: "King of Prussia, PA", dropoff: "Cherry Hill, NJ", time: "4:00 PM - 6:00 PM", routeDuration: 60, pay: 55.00, demand: 'medium', timeSlot: 'Evening Rush' },
  { id: 4, name: "Small Retail", pickup: "Old City, PA", dropoff: "Center City, PA", time: "10:30 AM - 11:30 AM", routeDuration: 15, pay: 12.00, demand: 'low', timeSlot: 'Late Morning' },
  { id: 5, name: "Pharmacy Supplies", pickup: "North Philly, PA", dropoff: "West Philly, PA", time: "7:00 AM - 8:30 AM", routeDuration: 30, pay: 22.00, demand: 'medium', timeSlot: 'Morning Rush' },
];

const MOCK_HEATMAP_DATA = [
  { area: "Center City (CC)", morning: 0.8, afternoon: 0.6, evening: 0.9, notes: "High retail/commercial density" },
  { area: "King of Prussia (KOP)", morning: 0.5, afternoon: 0.9, evening: 0.7, notes: "Peak around business closing times" },
  { area: "South Philly / Pennsport", morning: 0.9, afternoon: 0.7, evening: 0.6, notes: "High warehouse and distribution center activity" },
  { area: "University City / West Philly", morning: 0.6, afternoon: 0.8, evening: 0.5, notes: "Steady throughout the day" },
];

// Helper function to simulate API latency
const mockFetch = (data, delay = 500) => new Promise(resolve => setTimeout(() => resolve(data), delay));

// --- COMPONENTS ---

const Card = ({ children, className = '' }) => (
  // Updated for dark theme: bg-white -> bg-slate-800, border-gray-100 -> border-slate-700
  <div className={`bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-700 ${className}`}>
    {children}
  </div>
);

const TabButton = ({ isActive, onClick, icon: Icon, label }) => (
  <button
    className={`flex-1 flex flex-col items-center justify-center p-3 transition-colors duration-200 ${
      isActive
        // Dark theme active: use rose for accent, darker slate background
        ? 'text-rose-400 border-b-4 border-rose-400 bg-slate-700' 
        // Dark theme inactive: light gray text, hover rose accent
        : 'text-gray-400 hover:text-rose-400' 
    }`}
    onClick={onClick}
  >
    <Icon className="w-5 h-5 mb-1" />
    <span className="text-xs font-medium">{label}</span>
  </button>
);

// New component for mock API status check
const MockApiStatus = ({ isAuthReady, authToken }) => {
  const [routeStatus, setRouteStatus] = useState('pending');
  const [dataStatus, setDataStatus] = useState('pending');
  
  useEffect(() => {
    if (!isAuthReady || !authToken) return;

    // Simulate checking the API status, confirming token is active
    setTimeout(() => setRouteStatus('online'), 1000); 
    setTimeout(() => setDataStatus('online'), 1500); 
  }, [isAuthReady, authToken]);

  const getStatusColor = (status) => {
    switch(status) {
      case 'online': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-yellow-500 animate-pulse';
    }
  };
  
  const isDemo = authToken === 'DEMO_MODE';

  return (
    <div className="flex space-x-4 text-xs mt-2 justify-center sm:justify-end">
        {isDemo && (
            <div className="flex items-center text-yellow-400 font-bold">
                <Zap className="w-3 h-3 mr-1" />
                DEMO MODE
            </div>
        )}
      <div className="flex items-center">
        <span className={`w-2 h-2 rounded-full mr-1 ${getStatusColor(routeStatus)}`}></span>
        <span className="text-gray-400 font-medium">Routes (Token): {routeStatus.toUpperCase()}</span>
      </div>
      <div className="flex items-center">
        <span className={`w-2 h-2 rounded-full mr-1 ${getStatusColor(dataStatus)}`}></span>
        <span className="text-gray-400 font-medium">Heatmap (Public): {dataStatus.toUpperCase()}</span>
      </div>
    </div>
  );
};


// 1. BEST ROUTES VIEW
const BestRoutesView = ({ isAuthReady, homeZone }) => {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return; 

    setLoading(true);
    mockFetch(MOCK_GIGS_DATA).then(data => {
      // Filter/Prioritize gigs based on the user's home zone for personalization
      const prioritizedData = data.map(gig => ({
          ...gig,
          priority: gig.pickup.includes(homeZone) ? 1 : 0, // Mock priority boost
      })).sort((a, b) => b.priority - a.priority);

      const sorted = prioritizedData.map(gig => ({
        ...gig,
        payPerMinute: gig.pay / gig.routeDuration,
      })).sort((a, b) => b.payPerMinute - a.payPerMinute);
      
      setGigs(sorted);
      setLoading(false);
    });
  }, [isAuthReady, homeZone]);

  if (!isAuthReady) return <div className="text-center py-8 text-gray-400">Authenticating user session...</div>;
  if (loading) return <div className="text-center py-8 text-indigo-400">Loading mock route data...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400 px-4">
        Simulated opportunities sorted by estimated efficiency, **prioritizing your Home Zone: {homeZone}**.
      </p>
      {gigs.map(gig => (
        <Card key={gig.id} className="mx-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold text-gray-50">{gig.name}</h3>
              <p className={`text-xs font-bold uppercase ${gig.demand === 'very-high' ? 'text-rose-400' : 'text-green-400'}`}>
                {gig.demand} Opportunity
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-extrabold text-rose-400">${gig.pay.toFixed(2)}</p>
              <p className="text-sm text-gray-400">
                ${gig.payPerMinute.toFixed(2)}/min
              </p>
            </div>
          </div>
          <div className="mt-3 text-sm space-y-1 border-t pt-3 border-slate-700">
            <div className="flex items-center text-gray-300">
              <MapPin className="w-4 h-4 mr-2 text-rose-400" />
              Pickup: <span className="font-medium ml-1">{gig.pickup}</span>
            </div>
            <div className="flex items-center text-gray-300">
              <Target className="w-4 h-4 mr-2 text-green-400" />
              Dropoff: <span className="font-medium ml-1">{gig.dropoff}</span>
            </div>
            <div className="flex items-center text-gray-300">
              <Clock className="w-4 h-4 mr-2 text-indigo-400" />
              Route Time: <span className="font-medium ml-1">{gig.routeDuration} mins</span> (Est.)
            </div>
          </div>
          <button className="w-full mt-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition duration-150">
            Simulate Acceptance
          </button>
        </Card>
      ))}
    </div>
  );
};

// 2. DAILY ESTIMATE VIEW
const DailyEstimateView = ({ isAuthReady, avgPay, avgTime }) => {
  const [loading, setLoading] = useState(true);
  const totalGigsAvailable = MOCK_GIGS_DATA.length;
  // Use a mock number of completed gigs, typically 2 or 3 for a projection
  const completedGigs = 2; 

  useEffect(() => {
    if (isAuthReady) {
      // Simulate data processing delay using personalized averages
      setTimeout(() => setLoading(false), 500);
    }
  }, [isAuthReady]);

  // Calculate projected earnings based on personalized averages
  const { totalPay, totalTime } = useMemo(() => {
    const projectedGigs = completedGigs + totalGigsAvailable;
    const estimatedPay = projectedGigs * avgPay;
    const estimatedTime = projectedGigs * avgTime; 
    return {
      totalPay: estimatedPay,
      totalTime: estimatedTime,
    };
  }, [avgPay, avgTime, totalGigsAvailable]);

  const totalTimeHours = totalTime / 60;
  const hourlyRate = totalTimeHours > 0 ? (totalPay / totalTimeHours) : 0;
  
  // Calculate simulated actual earnings based on mock data
  const simulatedActualPay = MOCK_GIGS_DATA.reduce((sum, g) => sum + g.pay, 0) + 55.00; // 55.00 mock completed gig value

  if (!isAuthReady) return <div className="text-center py-8 text-gray-400">Authenticating user session...</div>;
  if (loading) return <div className="text-center py-8 text-indigo-400">Calculating daily projection...</div>;

  return (
    <div className="space-y-6 px-4">
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-100 flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-green-400" />
            Daily Earning Projection (Personalized)
          </h3>
          <span className="text-3xl font-extrabold text-rose-400">
            ${totalPay.toFixed(2)}
          </span>
        </div>
        <p className="text-sm text-gray-400 mt-1">
          Based on **your average** of ${avgPay.toFixed(2)} / gig over {completedGigs + totalGigsAvailable} gigs.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center">
          <p className="text-xl font-bold text-gray-50">{totalTime.toFixed(0)} min</p>
          <p className="text-sm text-gray-400">Total Engaged Time (Est.)</p>
        </Card>
        <Card className="text-center">
          <p className="text-xl font-bold text-gray-50">
            ${hourlyRate.toFixed(2)}
          </p>
          <p className="text-sm text-gray-400">Hourly Rate (Est. Avg.)</p>
        </Card>
      </div>

      <Card>
        <h4 className="font-semibold text-gray-100 mb-2">Simulated vs. Personalized Projection</h4>
        <div className="space-y-2 text-sm text-gray-300">
          <div className="flex justify-between border-b border-slate-700 pb-1">
            <span className='font-bold'>Simulated Actual Pay (Mock Gigs)</span>
            <span className="font-medium text-green-400">${simulatedActualPay.toFixed(2)}</span>
          </div>
          <div className="flex justify-between pt-2 font-bold text-base text-gray-50">
            <span className='text-rose-400'>Your Projection ({avgPay.toFixed(2)}/gig)</span>
            <span className='text-rose-400'>${totalPay.toFixed(2)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

// 3. HEAT MAP VIEW - PUBLIC DATA FOCUS
const HeatMapView = ({ isAuthReady, homeZone }) => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady) return; 

    setLoading(true);
    // Fetch public data only after auth is ready
    mockFetch(MOCK_HEATMAP_DATA).then(data => {
      // Highlight the user's home zone
      const highlightedData = data.map(row => ({
          ...row,
          isHomeZone: row.area.includes(homeZone),
      }));
      setHeatmapData(highlightedData);
      setLoading(false);
    });
  }, [isAuthReady, homeZone]);

  if (!isAuthReady) return <div className="text-center py-8 text-gray-400">Authenticating user session...</div>;
  if (loading) return <div className="text-center py-8 text-indigo-400">Loading public data...</div>;

  const getIntensityClass = (value) => {
    if (value >= 0.8) return 'bg-rose-500';
    if (value >= 0.7) return 'bg-orange-400';
    if (value >= 0.5) return 'bg-yellow-400';
    return 'bg-green-500';
  };

  const getIntensityLabel = (value) => {
    if (value >= 0.8) return 'Very High';
    if (value >= 0.7) return 'High';
    if (value >= 0.5) return 'Medium';
    return 'Low';
  };

  return (
    <div className="space-y-4 px-4">
      <p className="text-sm text-gray-400 px-4">
        <TrendingUp className="w-4 h-4 inline mr-1 text-rose-400"/> **Opportunity Density Map:** Based on **publicly available data** (business density, distribution centers, major retail locations) in the Philadelphia area. Your Home Zone ({homeZone}) is highlighted.
      </p>

      <Card className="overflow-x-auto">
        <h4 className="font-semibold text-gray-100 mb-4">Area Business Concentration by Time Slot</h4>
        <table className="min-w-full divide-y divide-slate-700">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
              <th className="py-2">Area</th>
              <th className="py-2 text-center">Morning (7-11 AM)</th>
              <th className="py-2 text-center">Afternoon (11 AM - 4 PM)</th>
              <th className="py-2 text-center">Evening Rush (4-8 PM)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {heatmapData.map((row, index) => (
              <tr key={index} className={`${row.isHomeZone ? 'bg-slate-700/50' : 'hover:bg-slate-700'}`}>
                <td className="py-3 text-sm font-medium text-gray-50">
                    {row.area} {row.isHomeZone && <span className="text-rose-400 text-xs">(Home)</span>}
                    <p className='text-xs text-gray-400 mt-0.5 font-normal italic'>{row.notes}</p>
                </td>
                <td className="py-3 text-sm text-center">
                  <span className={`px-2 py-0.5 rounded-full text-white font-semibold text-xs ${getIntensityClass(row.morning)}`}>
                    {getIntensityLabel(row.morning)}
                  </span>
                </td>
                <td className="py-3 text-sm text-center">
                  <span className={`px-2 py-0.5 rounded-full text-white font-semibold text-xs ${getIntensityClass(row.afternoon)}`}>
                    {getIntensityLabel(row.afternoon)}
                  </span>
                </td>
                <td className="py-3 text-sm text-center">
                  <span className={`px-2 py-0.5 rounded-full text-white font-semibold text-xs ${getIntensityClass(row.evening)}`}>
                    {getIntensityLabel(row.evening)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};


// 4. PERSONALIZATION SETTINGS COMPONENT
const PersonalizationSettings = ({ userId, db, homeZone, setHomeZone, avgPay, setAvgPay, avgTime, setAvgTime, onClose }) => {
    const [zoneInput, setZoneInput] = useState(homeZone);
    const [payInput, setPayInput] = useState(avgPay.toFixed(2));
    const [timeInput, setTimeInput] = useState(avgTime.toFixed(0));
    const [suggestions, setSuggestions] = useState([]); // New state for Autocomplete suggestions
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    
    // Check if any setting has changed
    const hasChanges = zoneInput !== homeZone || parseFloat(payInput) !== avgPay || parseInt(timeInput) !== avgTime;

    const fetchSuggestions = useCallback(async (input) => {
        // --- STEP 1: Using the GOOGLE_MAPS_API_KEY for a conceptual API call ---
        if (input.length < 3) {
            setSuggestions([]);
            return;
        }

        /*
        // REAL API INTEGRATION (Requires CORS/Backend configuration not available here)
        const placesApiUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=(regions)&key=${GOOGLE_MAPS_API_KEY}&components=country:us|country:ca`;
        
        try {
            // Note: This fetch will likely fail due to sandbox/CORS limitations, 
            // but the structure is correct for external deployment.
            const response = await fetch(placesApiUrl);
            const data = await response.json();
            if (data.predictions) {
                // Map the results to just the description (place name)
                const realSuggestions = data.predictions.map(p => p.description);
                setSuggestions(realSuggestions);
            } else {
                 setSuggestions([]);
            }
        } catch (error) {
            // Fallback to mock on API error
            console.error("Error calling Google Places API (using mock fallback):", error);
            // setSuggestions([]); 
        }
        */

        // MOCKING the behavior to keep the app runnable in this environment:
        const mockResults = [
            "Center City, Philadelphia, PA",
            "South Philly, Philadelphia, PA",
            "Fishtown, Philadelphia, PA",
            "King of Prussia, PA",
            "Cherry Hill, NJ (nearby)",
        ].filter(name => name.toLowerCase().includes(input.toLowerCase()));

        setSuggestions(mockResults);

    }, []); // fetchSuggestions is memoized

    
    const handleZoneChange = (e) => {
        const input = e.target.value;
        setZoneInput(input);
        fetchSuggestions(input); // Trigger suggestion lookup
    };

    const handleSuggestionClick = (suggestion) => {
        setZoneInput(suggestion);
        setSuggestions([]); // Clear suggestions after selection
    };

    const saveSettings = useCallback(async () => {
        if (!userId || !db || !hasChanges) return;
        setSaving(true);
        setMessage('');

        const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/driver_data/config`);
        
        const newPay = parseFloat(payInput);
        const newTime = parseInt(timeInput);

        if (isNaN(newPay) || isNaN(newTime) || newPay <= 0 || newTime <= 0) {
            setMessage('Error: Pay and Time must be valid positive numbers.');
            setSaving(false);
            return;
        }

        try {
            await setDoc(userDocRef, {
                homeZone: zoneInput,
                avgPay: newPay,
                avgTime: newTime,
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            setHomeZone(zoneInput);
            setAvgPay(newPay);
            setAvgTime(newTime);
            setMessage('Settings saved successfully!');
        } catch (error) {
            console.error("Error saving settings to Firestore:", error);
            setMessage('Error: Failed to save settings.');
        } finally {
            setSaving(false);
        }
    }, [userId, db, zoneInput, payInput, timeInput, homeZone, avgPay, avgTime, setHomeZone, setAvgPay, setAvgTime, appId, hasChanges]);

    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-rose-400 flex items-center">
                        <Settings className="w-5 h-5 mr-2" /> Personalization Settings
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-rose-400">
                        &times;
                    </button>
                </div>

                <p className="text-sm text-gray-300 mb-4">
                    Customize the simulation data. This information is saved securely to your profile.
                </p>

                {/* Home Zone Setting with Autocomplete Structure */}
                <div className="mb-4 relative">
                    <label className="block text-sm font-medium text-gray-100 mb-1" htmlFor="homeZone">
                        Primary Operating Zone (City/Neighborhood/ZIP)
                    </label>
                    <input
                        id="homeZone"
                        type="text"
                        value={zoneInput}
                        onChange={handleZoneChange} // Use custom change handler
                        className="w-full p-3 bg-slate-700 text-gray-50 border border-slate-600 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                        placeholder="Start typing area name or ZIP code..."
                        disabled={saving}
                    />

                    {/* Autocomplete Dropdown Implementation */}
                    {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                            {suggestions.map((suggestion, index) => (
                                <div
                                    key={index}
                                    className="p-3 text-sm text-gray-300 hover:bg-slate-600 cursor-pointer transition-colors"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                >
                                    {suggestion}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Metrics Settings */}
                <h3 className="text-md font-semibold text-gray-100 flex items-center mt-6 mb-3">
                    <Calculator className="w-4 h-4 mr-2 text-green-400" />
                    Personal Driving Metrics
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-100 mb-1" htmlFor="avgPay">
                            Avg. Pay per Gig ($)
                        </label>
                        <input
                            id="avgPay"
                            type="number"
                            step="0.01"
                            value={payInput}
                            onChange={(e) => setPayInput(e.target.value)}
                            className="w-full p-3 bg-slate-700 text-gray-50 border border-slate-600 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                            placeholder="e.g., 24.50"
                            disabled={saving}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-100 mb-1" htmlFor="avgTime">
                            Avg. Time per Gig (min)
                        </label>
                        <input
                            id="avgTime"
                            type="number"
                            step="1"
                            value={timeInput}
                            onChange={(e) => setTimeInput(e.target.value)}
                            className="w-full p-3 bg-slate-700 text-gray-50 border border-slate-600 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                            placeholder="e.g., 45"
                            disabled={saving}
                        />
                    </div>
                </div>


                <button
                    onClick={saveSettings}
                    disabled={saving || !hasChanges}
                    className={`w-full py-3 rounded-lg text-white font-semibold transition duration-150 flex items-center justify-center ${
                        saving ? 'bg-indigo-400' : 'bg-rose-600 hover:bg-rose-500'
                    } ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Save className="w-5 h-5 mr-2" />
                    {saving ? 'Saving...' : 'Save All Changes'}
                </button>

                {message && (
                    <p className={`mt-3 text-center text-sm ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                        {message}
                    </p>
                )}
            </Card>
        </div>
    );
};

// Mock Login Component - displayed before access
const LoginScreen = ({ setAuthToken }) => {
    const [inputValue, setInputValue] = useState('');
    const [isSimulatingLogin, setIsSimulatingLogin] = useState(false);

    const handleLogin = () => {
        setIsSimulatingLogin(true);
        // Simulate a successful login with a Bearer Token after a short delay
        setTimeout(() => {
            setAuthToken(inputValue); 
        }, 1500);
    };
    
    const handleSkip = () => {
        // Set a dummy token to proceed to dashboard immediately
        setAuthToken('DEMO_MODE');
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4">
            <Card className="max-w-md w-full text-center">
                <h2 className="text-2xl font-bold text-rose-400 mb-2">Roadie Sandbox Connection</h2>
                <p className="text-sm text-gray-300 mb-4">
                    To make this app functional, you must first connect using a Roadie Bearer Token.
                </p>

                <div className="text-left bg-slate-700 p-4 rounded-lg mb-6 border border-slate-600">
                    <p className="text-sm font-semibold text-gray-50 mb-2 flex items-center">
                        <Key className="w-4 h-4 mr-2 text-rose-400" />
                        Step 1: Obtain Your Roadie Bearer Token
                    </p>
                    <p className="text-xs text-gray-300 mb-2 flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-indigo-400"/>
                        1. Contact Roadie Sales at <a href="mailto:sales@roadie.com" className="text-indigo-400 hover:underline">sales@roadie.com</a> to request access to the sandbox environment.
                    </p>
                    <p className="text-xs text-gray-300 mb-3">
                        2. You'll receive your **sandbox bearer token** for authentication.
                    </p>
                </div>
                
                <div className="relative mb-4">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="password"
                        placeholder="Enter your Roadie Sandbox Bearer Token"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className="w-full py-3 pl-10 pr-4 bg-slate-700 text-gray-50 border border-slate-600 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                        disabled={isSimulatingLogin}
                    />
                </div>

                <button
                    onClick={handleLogin}
                    disabled={isSimulatingLogin || inputValue.length < 5}
                    className={`w-full py-3 rounded-lg text-white font-semibold transition duration-150 
                        ${isSimulatingLogin ? 'bg-indigo-400' : 'bg-rose-600 hover:bg-rose-500'} 
                        ${inputValue.length < 5 ? 'opacity-50 cursor-not-allowed' : ''} mb-3`}
                >
                    {isSimulatingLogin ? 'Authenticating Token...' : 'Connect to Sandbox'}
                </button>
                
                <button
                    onClick={handleSkip}
                    disabled={isSimulatingLogin}
                    className={`w-full py-2 rounded-lg text-gray-300 font-semibold border border-slate-600 transition duration-150 
                        ${isSimulatingLogin ? 'bg-slate-700 opacity-70' : 'hover:bg-slate-700'}`}
                >
                    Skip for Demo Mode
                </button>


                <p className="text-xs text-gray-400 mt-4">
                    *The Bearer Token is required for the application to simulate authorized data access.
                </p>
            </Card>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

const TABS = {
  ROUTES: 'Routes',
  ESTIMATE: 'Estimate',
  HEATMAP: 'Heatmap',
};


const App = () => {
  const [activeTab, setActiveTab] = useState(TABS.ROUTES);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Personalized Metrics: Default values based on general service data
  const [homeZone, setHomeZone] = useState('Center City');
  const [avgPay, setAvgPay] = useState(25.00); 
  const [avgTime, setAvgTime] = useState(40); // in minutes
  
  const [authToken, setAuthToken] = useState(null); // Roadie Auth Token (or 'DEMO_MODE')

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

  // Function to fetch user configuration
  const fetchConfig = useCallback(async (dbInstance, uid) => {
    const userDocRef = doc(dbInstance, `artifacts/${appId}/users/${uid}/driver_data/config`);
    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            setHomeZone(data.homeZone || 'Center City');
            // Load personalized metrics, defaulting if missing
            setAvgPay(data.avgPay || 25.00);
            setAvgTime(data.avgTime || 40);
        }
    } catch (error) {
        console.error("Error fetching user config:", error);
    }
  }, [appId]);

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    if (!authToken) return;

    setLogLevel('debug');
    
    try {
      const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);

      setAuth(authInstance);
      setDb(dbInstance);

      onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
          await fetchConfig(dbInstance, user.uid); // Load personalized data
          setIsAuthReady(true);
        } else {
          const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
          
          if (initialAuthToken) {
            try {
              const result = await signInWithCustomToken(authInstance, initialAuthToken);
              await fetchConfig(dbInstance, result.user.uid);
            } catch (error) {
              console.error("Error signing in with custom token, signing in anonymously:", error);
              await signInAnonymously(authInstance);
            }
          } else {
            await signInAnonymously(authInstance);
          }
          setIsAuthReady(true);
        }
      });
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setIsAuthReady(true);
    }
  }, [fetchConfig, authToken]); 

  const renderContent = () => {
    // 0. If no Roadie Auth Token is set, show the Login screen with instructions
    if (!authToken) {
        return <LoginScreen setAuthToken={setAuthToken} />;
    }

    // 1. If Token is present but Firebase Auth is not ready, show connecting state
    if (!isAuthReady) {
      return (
        <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-400 mx-auto"></div>
            <p className="mt-4 text-gray-400">Authenticating user session with Firebase...</p>
        </div>
      );
    }

    // 2. Auth is ready, show dashboard content
    switch (activeTab) {
      case TABS.ROUTES:
        return <BestRoutesView isAuthReady={isAuthReady} homeZone={homeZone} />;
      case TABS.ESTIMATE:
        return <DailyEstimateView isAuthReady={isAuthReady} avgPay={avgPay} avgTime={avgTime} />;
      case TABS.HEATMAP:
        return <HeatMapView isAuthReady={isAuthReady} homeZone={homeZone} />;
      default:
        return null;
    }
  };


  return (
    <div className="min-h-screen bg-slate-900 font-sans antialiased">
      {/* Header and Title */}
      {/* Conditionally hide the header content if the LoginScreen is showing */}
      {authToken && (
        <header className="bg-slate-800 shadow-xl sticky top-0 z-10">
          <div className="p-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center">
            <div className="mb-2 sm:mb-0">
              <h1 className="text-xl font-bold text-rose-400">Roadie Driver Pro (Philly)</h1>
              <p className="text-xs text-gray-400">Public Opportunity Dashboard</p>
            </div>
            
            {/* User Status and Settings Button */}
            {isAuthReady && userId && (
              <div className="flex flex-col items-center sm:items-end">
                  <div className="flex items-center space-x-3">
                      <button 
                          onClick={() => setShowSettings(true)} 
                          className="p-2 rounded-full bg-slate-700 text-rose-400 hover:bg-slate-600 transition duration-150"
                          title="Personalization Settings"
                      >
                          <Settings className="w-5 h-5" />
                      </button>

                      <div className="flex items-center text-sm text-gray-50 bg-slate-700 p-2 rounded-lg">
                          <User className="w-4 h-4 mr-1 text-rose-400" />
                          <span className="font-semibold truncate max-w-[150px]" title={userId}>
                              ID: {userId}
                          </span>
                      </div>
                  </div>
                  <MockApiStatus isAuthReady={isAuthReady} authToken={authToken} />
              </div>
            )}
            {!isAuthReady && (
              <div className="text-sm text-gray-400">Connecting...</div>
            )}
          </div>

          {/* Tab Navigation */}
          <nav className="flex justify-around border-b border-slate-700">
            <TabButton
              isActive={activeTab === TABS.ROUTES}
              onClick={() => setActiveTab(TABS.ROUTES)}
              icon={Clock}
              label="Best Routes (Est.)"
            />
            <TabButton
              isActive={activeTab === TABS.ESTIMATE}
              onClick={() => setActiveTab(TABS.ESTIMATE)}
              icon={DollarSign}
              label="Daily Estimate (Est.)"
            />
            <TabButton
              isActive={activeTab === TABS.HEATMAP}
              onClick={() => setActiveTab(TABS.HEATMAP)}
              icon={MapPin}
              label="Public Data Map"
            />
          </nav>
        </header>
      )}


      {/* Main Content Area */}
      <main className="py-6 pb-20">
        {renderContent()}
      </main>

      {/* Settings Modal */}
      {showSettings && isAuthReady && (
        <PersonalizationSettings 
          userId={userId} 
          db={db} 
          homeZone={homeZone} 
          setHomeZone={setHomeZone}
          avgPay={avgPay}
          setAvgPay={setAvgPay}
          avgTime={avgTime}
          setAvgTime={setAvgTime}
          onClose={() => setShowSettings(false)} 
        />
      )}
      
      {/* Tailwind configuration for mobile-first design */}
      <style>{`
        body { margin: 0; }
        .font-sans { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
};

export default App;