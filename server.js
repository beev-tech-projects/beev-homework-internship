const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { randomInt } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.argv[2] || 8338;

app.use(cors());
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Database Configuration
const dbPath = path.join(__dirname, 'fleet.db');
const db = new sqlite3.Database(dbPath);

// Vehicle simulation state
const activeVehicles = new Map(); // vehicleId -> simulation data
const simulationInterval = 1000; // 1 second

const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        batteryLevel INTEGER DEFAULT 100,
        kilometers REAL DEFAULT 0.0,
        status TEXT DEFAULT 'available',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastUpdated TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      db.get("SELECT COUNT(*) as count FROM vehicles", (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row.count === 0) {
          console.log('Seeding database with initial data...');
          generateInitialData().then(resolve).catch(reject);
        } else {
          console.log(`Database already contains ${row.count} vehicles`);
          resolve();
        }
      });
    });
  });
};

const generateInitialData = () => {
  return new Promise((resolve, reject) => {
    const vehicles = [
      { id: 'VEH001', make: 'Tesla', model: 'Model 3', batteryLevel: 87, kilometers: 15420.5, status: 'available' },
      { id: 'VEH002', make: 'Tesla', model: 'Model S', batteryLevel: 100, kilometers: 8932.1, status: 'available' },
      { id: 'VEH003', make: 'BMW', model: 'i4', batteryLevel: 34, kilometers: 22105.8, status: 'charging' },
      { id: 'VEH004', make: 'Volkswagen', model: 'ID.4', batteryLevel: 92, kilometers: 12876.3, status: 'available' },
      { id: 'VEH005', make: 'Nissan', model: 'Leaf', batteryLevel: 18, kilometers: 31245.7, status: 'charging' },
      { id: 'VEH006', make: 'Hyundai', model: 'Kona Electric', batteryLevel: 78, kilometers: 19654.2, status: 'available' },
      { id: 'VEH007', make: 'Ford', model: 'Mustang Mach-E', batteryLevel: 56, kilometers: 7832.9, status: 'charging' },
      { id: 'VEH008', make: 'Audi', model: 'e-tron', batteryLevel: 100, kilometers: 5421.6, status: 'available' },
      { id: 'VEH009', make: 'Tesla', model: 'Model Y', batteryLevel: 43, kilometers: 18765.4, status: 'charging' },
      { id: 'VEH010', make: 'Mercedes', model: 'EQS', batteryLevel: 89, kilometers: 9876.2, status: 'available' },
      { id: 'VEH011', make: 'Polestar', model: '2', batteryLevel: 12, kilometers: 25643.8, status: 'charging' },
      { id: 'VEH012', make: 'Chevrolet', model: 'Bolt EV', batteryLevel: 67, kilometers: 28421.5, status: 'available' },
      { id: 'VEH013', make: 'Lucid', model: 'Air', batteryLevel: 91, kilometers: 4532.1, status: 'available' },
      { id: 'VEH014', make: 'Rivian', model: 'R1T', batteryLevel: 28, kilometers: 16789.3, status: 'charging' },
      { id: 'VEH015', make: 'Genesis', model: 'GV60', batteryLevel: 76, kilometers: 11234.7, status: 'available' },
      { id: 'VEH016', make: 'Kia', model: 'EV6', batteryLevel: 5, kilometers: 33567.9, status: 'charging' },
      { id: 'VEH017', make: 'Volvo', model: 'XC40 Recharge', batteryLevel: 100, kilometers: 6789.4, status: 'available' },
      { id: 'VEH018', make: 'Porsche', model: 'Taycan', batteryLevel: 49, kilometers: 14523.6, status: 'charging' },
      { id: 'VEH019', make: 'Mini', model: 'Cooper SE', batteryLevel: 83, kilometers: 21876.2, status: 'available' },
      { id: 'VEH020', make: 'Jaguar', model: 'I-PACE', batteryLevel: 37, kilometers: 17432.8, status: 'charging' },
      { id: 'VEH021', make: 'Tesla', model: 'Cybertruck', batteryLevel: 95, kilometers: 2156.3, status: 'available' },
      { id: 'VEH022', make: 'BYD', model: 'Tang', batteryLevel: 22, kilometers: 26789.1, status: 'charging' },
      { id: 'VEH023', make: 'Fisker', model: 'Ocean', batteryLevel: 71, kilometers: 8943.7, status: 'available' },
      { id: 'VEH024', make: 'NIO', model: 'ET7', batteryLevel: 58, kilometers: 13654.9, status: 'charging' },
      { id: 'VEH025', make: 'Cadillac', model: 'Lyriq', batteryLevel: 100, kilometers: 3421.5, status: 'available' }
    ];


    const stmt = db.prepare(`
      INSERT INTO vehicles (id, make, model, batteryLevel, kilometers, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let completed = 0;
    vehicles.forEach(vehicle => {
      stmt.run([vehicle.id, vehicle.make, vehicle.model, vehicle.batteryLevel, vehicle.kilometers, vehicle.status], (err) => {
        if (err) {
          reject(err);
          return;
        }
        completed++;
        if (completed === vehicles.length) {
          stmt.finalize();
          console.log(`Successfully created ${vehicles.length} vehicles`);
          resolve();
        }
      });
    });
  });
};

// Update vehicle in database
const updateVehicle = (id, updates) => {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(new Date().toISOString());
    values.push(id);
    
    db.run(
      `UPDATE vehicles SET ${fields}, lastUpdated = ? WHERE id = ?`,
      values,
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      }
    );
  });
};

// Get vehicles
const getVehicles = () => {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT * FROM vehicles",
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
};

// Vehicle simulation logic
const startVehicleSimulation = async (vehicle) => {
  if (activeVehicles.has(vehicle.id)) {
    return; // Already active
  }

  console.log(`Starting simulation for vehicle ${vehicle.id}`);
  
  // Update status to 'in_use'
  await updateVehicle(vehicle.id, { 
    status: 'in_use',
  });

  const simulationData = {
    id: vehicle.id,
    batteryLevel: vehicle.batteryLevel,
    kilometers: vehicle.kilometers,
    phase: 'driving', // 'driving' or 'charging'
    startTime: Date.now()
  };

  activeVehicles.set(vehicle.id, simulationData);
  
  const interval = setInterval(async () => {
    const data = activeVehicles.get(vehicle.id);
    if (!data) {
      clearInterval(interval);
      return;
    }

    try {
      if (data.phase === 'driving') {
        // Decrease battery by 1% per second
        data.batteryLevel = Math.max(0, data.batteryLevel - 1);
        
        // Increase kilometers: 50 km/h = ~0.0139 km/second
        data.kilometers += 0.0139;

        await updateVehicle(vehicle.id, {
          batteryLevel: data.batteryLevel,
          kilometers: Math.round(data.kilometers * 100) / 100,
          status: 'in_use'
        });

        // Switch to charging when battery reaches 0
        if (data.batteryLevel <= 0) {
          console.log(`Vehicle ${vehicle.id} battery depleted, starting charge...`);
          data.phase = 'charging';
          await updateVehicle(vehicle.id, { status: 'charging' });
        }
      } else if (data.phase === 'charging') {
        // Increase battery by 1% per second
        data.batteryLevel = Math.min(100, data.batteryLevel + 1);

        await updateVehicle(vehicle.id, {
          batteryLevel: data.batteryLevel,
          status: 'charging'
        });

        // Vehicle is fully charged and available again
        if (data.batteryLevel >= 100) {
          console.log(`Vehicle ${vehicle.id} fully charged, returning to available`);
          await updateVehicle(vehicle.id, { 
            status: 'available',
          });
          
          activeVehicles.delete(vehicle.id);
          clearInterval(interval);
        }
      }

      // Emit real-time updates
      const updatedVehicle = await getVehicleById(vehicle.id);
      io.emit('vehicleUpdate', updatedVehicle);

    } catch (error) {
      console.error(`Error updating vehicle ${vehicle.id}:`, error);
      clearInterval(interval);
      activeVehicles.delete(vehicle.id);
    }
  }, simulationInterval);
};

// Get vehicle by ID
const getVehicleById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM vehicles WHERE id = ?", [id], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

// Main simulation loop - picks available vehicles
const runFleetSimulation = () => {
  setInterval(async () => {
    try {
      const availableVehicles = await getVehicles();

      if (availableVehicles) {
        await Promise.all(availableVehicles.map(availableVehicle => startVehicleSimulation(availableVehicle)));
      }
    } catch (error) {
      console.error('Error in fleet simulation:', error);
    }
  }, 2000); // Check every 2 seconds for available vehicles
};

// API Routes
app.get('/api/vehicles', (req, res) => {
  db.all('SELECT * FROM vehicles ORDER BY id', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/vehicles/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM vehicles WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Vehicle not found' });
      return;
    }
    res.json(row);
  });
});

app.get('/api/fleet/stats', (req, res) => {
  db.all(`
    SELECT 
      status,
      COUNT(*) as count,
      AVG(batteryLevel) as avgBattery,
      SUM(kilometers) as totalKilometers
    FROM vehicles 
    GROUP BY status
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    db.get(`
      SELECT 
        COUNT(*) as total,
        AVG(batteryLevel) as overallAvgBattery,
        SUM(kilometers) as overallTotalKm
      FROM vehicles
    `, (err, overall) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      res.json({
        byStatus: rows,
        overall: overall,
        activeSimulations: activeVehicles.size
      });
    });
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const startServer = async () => {
  try {
    await initDatabase();
    
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log('Starting fleet simulation...');
      
      // Start the simulation after a short delay
      setTimeout(runFleetSimulation, 3000);
    });
    
  } catch (error) {
    console.error('Error occurred during server startup:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nServer shutting down...');
  
  // Clear all active simulations
  activeVehicles.clear();
  
  db.close((err) => {
    if (err) {
      console.error('Database close error:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});

startServer();