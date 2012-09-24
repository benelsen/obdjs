var OBDReader = require('../../index'),
    fs        = require('fs'),
    sugar     = require('sugar'),
    _         = require('underscore');
    
    _.string  = require('underscore.string');
    
    _.mixin( _.string.exports() );

var obdr = new OBDReader('/dev/ttys002');

// Handle Interrupts / Signals
process.on('SIGINT', function() {
  console.log('Got a SIGINT / Disconnecting...');
    
  clearInterval(repeat);
  clearInterval(repeatWrite);
  
  obdr.disconnect(function(){ 
    fs.writeFileSync( 'log.json', JSON.stringify(log, null, "  ") );
    console.log( log );
    process.exit(1); 
  });
  
  // Fail-Safe if obdr can’t disconnect (1 min)
  setTimeout(     function(){ 
    fs.writeFileSync( 'log.json', JSON.stringify(log, null, "  ") );
    console.log( log );
    process.exit(1); 
  }, 1*60*1000 );
  
});

/* REQUIRED FUNCTIONS */

var generateSequence = function(pids) {
  
  var sequence_length = pids[0].seq.length;
  
  var sequence = [];
  
  var sPids = pids.sortBy(function(e){
    return e.seq.count(1);
  },true);
  
  for (var i = 0; i < sequence_length + 1; i++) {
    sPids.forEach(function(e){
      if( e.seq[i] == 1 ) {
        sequence.push(e.pid);
      }
    });
  };
  
  return sequence;
};


var valid_pids = [
  '04','05','0A','0B','0C','0D','0F','10'
];

var keys = {
  '04': 'load', '05': 'coolanttemp', '0A': 'fuelpress',  '0B': 'intakepress', 
  '0C': 'rpm',  '0D': 'speed',       '0F': 'intaketemp', '10': 'mafflowrate'
};

var convert = {
  '04': function(hex) {
    // A*100/255
    return parseInt( hex[0], 16) *100/256;
  },
  '05': function(hex) {
    // A-40
    return parseInt( hex[0], 16) -40;
  },
  '0A': function(hex) {
    // A*3
    return parseInt( hex[0], 16) *3;
  },
  '0B': function(hex) {
    // A
    return parseInt( hex[0], 16);
  },
  '0C': function(hex) {
    // ((A*256)+B)/4
    return ( ( parseInt( hex[0], 16) * 256 ) + parseInt( hex[1], 16) ) / 4;
  },
  '0D': function(hex) {
    // A
    return parseInt( hex[0], 16);
  },
  '0F': function(hex) {
    // A-40
    return parseInt( hex[0], 16) -40;
  },
  '10': function(hex) {
    // ((A*256)+B)/100
    return ( ( parseInt( hex[0], 16) * 256 ) + parseInt( hex[1], 16) ) / 100;
  }
};

/* **** */

// Connect to the OBDII-Reader 
obdr.connect();
// Initialize it
obdr.init();

// Define Sequence
var pids = [
  {pid:'0104',seq:[1,1,1,1,1,1,1,1]}, // engine load
  {pid:'0105',seq:[0,1,0,0,0,0,0,0]}, // Engine coolant temperature
  {pid:'010A',seq:[0,0,0,1,0,0,0,0]}, // Fuel pressure
  {pid:'010B',seq:[0,0,0,0,0,1,0,0]}, // Intake manifold absolute pressure
  {pid:'010C',seq:[1,1,1,1,1,1,1,1]}, // Engine RPM
  {pid:'010D',seq:[1,1,1,1,1,1,1,1]}, // Vehicle speed
  {pid:'010F',seq:[0,0,0,0,0,0,0,1]}, // Intake air temperature
  {pid:'0110',seq:[1,0,1,0,1,0,1,0]}  // MAF air flow rate
];

var sequence = generateSequence(pids);

var log = {};

for (var i = valid_pids.length - 1; i >= 0; i--) {
  log[keys[valid_pids[i]]] = [];
};

var repeat = setInterval( function() {
  
  // Trying not to overload the queue
  if ( obdr.queue.length() < 5 ) {
    
    for (var i = 0 ; i <= sequence.length - 1; i++ ) {
      
      obdr.send(sequence[i],function(err, data) {
        if (err) throw err;
        
        fs.appendFile('log.csv', Date.now() + ',' + data.req + ',' + data.res + '\n');

        if( valid_pids.indexOf( data.res.substr(2,2) ) > -1 ) {
          
          var time  = new Date().toISOString();
          var key   = keys[ data.res.substr(2,2) ];
          
          var hex = _.chop(data.res.substr(4),2);
          
          var value = convert[data.res.substr(2,2)](hex);
          
          if( value && key ) {
            
            var entry = {
              time: time
            };
            
            entry[key] = value;
            
            console.log(entry);
            
            log[key].push(entry);
            
            entry = undefined;
            
          }; // if    
            
        }; // if
                
      }); // obdr.send
      
    }; // for
    
  }; // if
  
},0);

var repeatWrite = setInterval( function() {
  fs.writeFile( 'log.json', JSON.stringify(log, null, "  "), function(err){
      if (err) throw err;
      console.log('Saved');
  });
}, 10*1000);

