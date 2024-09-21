/*
 * ============================================================================
 * Copyright © 2002-2024 by Thomas Thrien.
 * All Rights Reserved.
 * ============================================================================
 * Licensed to the public under the agreements of the GNU Lesser General Public
 * License, version 3.0 (the "License"). You may obtain a copy of the License at
 *
 *      http://www.gnu.org/licenses/lgpl.html
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

/*
 * Use this script to switch on some light as the response to motion detected
 * by a Shelly Blu Motion device.
 *
 * The script will only respond if the reported illuminance is below a given
 * threshold. Therefore it should be used with only one Shelly BLU Motion only,
 * although it supports multiple of them.
 *
 * The switching Shelly component (a Shelly Plus1 in my case) is configured to
 * revert the device status after some time; this is not configured by the
 * script.
 */
/******************* START CHANGE HERE *******************/
let CONFIG = {
  /**
   * When set to true, debug messages will be logged to the console.
   */
  debug: true,

  /**
   * When set to true and the script owns the scanner, the scan will be active.
   * Active scan means the scanner will ping back the Bluetooth device to
   * receive all its data, but it will drain the battery of that device faster.
   */
  active: false,

  /**
   * When `allowedMacAddresses` is set to null, events from every bluetooth
   * device are accepted, otherwise only those from a device whose MAC address
   * will match.
   */
  //  allowedMacAddresses: null,
  allowedMacAddresses: [
  // "aa:bc:12:34:56:78", // events only from these mac addresses are allowed.
    "b0:c7:de:3b:29:15"
  ],

  /**
   * Light will be switched on only when the illuminance is reported to be
   * lower than the given value.
   */
  illuThreshold: 15,

  /**
   * Called when motion is reported by the filtered Shelly BLU Motion devices.
   *
   * @param {Boolean} motion – true, when there was motion detected, false
   *     otherwise.
   * @param {Object} eventData – An object, containing all parameters received
   *     from the Shelly BLU Motion device.
   *     Example: {"encryption":false,"BTHome_version":2,"pid":16,
   *         "battery":100,"illuminance":109,"motion":1,"button":1,"rssi":-53,
   *         "address":"aa:bc:12:34:56:78"}
   */
  motionHandler: function( motion, eventData )
  {
    if( motion && eventData.illuminance < CONFIG.illuThreshold )
    {
      logger( "Light switched on", "Info" );
      Shelly.call( "Switch.Set", { id: 0, on: true } );
    }
  },

  /**
   * Called when illuminance is reported from the filtered Shelly BLU Motion
   * devices.
   *
   * @param {Number} illuminance – Current illuminance value.
   * @param {Object} eventData – An object, containing all parameters received
   *     from the Shelly BLU Motion device.
   *     Example: {"encryption":false,"BTHome_version":2,"pid":16,
   *         "battery":100,"illuminance":109,"motion":1,"button":1,"rssi":-53,
   *         "address":"aa:bc:12:34:56:78"}
   */
  illuminanceHandler: function( illuminance, eventData )
  {
    // Does nothing currently.
  },

  /**
   * Called when packet from filtered Shelly BLU Motion devices is received.
   * @param {Object} eventData – An object, containing all parameters received
   *    from the Shelly BLU Motion device.
   *    Example: {"encryption":false,"BTHome_version":2,"pid":16,
   *        "battery":100,"illuminance":109,"motion":1,"button":1,"rssi":-53,
   *        "address":"aa:bc:12:34:56:78"}
   */
  onStatusUpdate: function( eventData )
  {
    // Does nothing currently.
  }
};
/******************* STOP CHANGE HERE *******************/

let ALLTERCO_MFD_ID_STR = "0ba9";
let BTHOME_SVC_ID_STR = "fcd2";

let uint8 = 0;
let int8 = 1;
let uint16 = 2;
let int16 = 3;
let uint24 = 4;
let int24 = 5;

/**
 * Logs the provided message with an optional prefix to the console.
 *
 * @param {Object} message – The message.
 * @param {String} prefix – The prefix.
 */
function logger( message, prefix )
{
  //---* Exit if debug isn't enabled *-----------------------------------------
  if( !CONFIG.debug ) { return; }

  let finalText = "";

  //---* Loop over it of the message if it is a list of some kind *------------
  if( Array.isArray( message ) )
  {
    for( let i = 0; i < message.length; ++i )
    {
      finalText = finalText + " " + JSON.stringify( message [i] );
    }
  }
  else
  {
    finalText = JSON.stringify( message );
  }

  //---* The prefix must be a string *-----------------------------------------
  if( typeof prefix !== "string" )
  {
    prefix = "";
  }
  else
  {
    prefix = prefix + ":";
  }

  //---* Log the result *------------------------------------------------------
  console.log(prefix, finalText);
}   //  logger()

/**
 * The BTH object defines the structure of the BTHome data.
 */
let BTH = {};
BTH[0x00] = { n: "pid", t: uint8 };
BTH[0x01] = { n: "battery", t: uint8, u: "%" };
BTH[0x02] = { n: "temperature", t: int16, f: 0.01, u: "tC" };
BTH[0x03] = { n: "humidity", t: uint16, f: 0.01, u: "%" };
BTH[0x05] = { n: "illuminance", t: uint24, f: 0.01 };
BTH[0x21] = { n: "motion", t: uint8 };
BTH[0x2d] = { n: "window", t: uint8 };
BTH[0x3a] = { n: "button", t: uint8 };
BTH[0x3f] = { n: "rotation", t: int16, f: 0.1 };

/**
 * Returns the number of bytes for the given type.
 *
 * @param {Number} type – The type.
 * @return {Number} – The number of byte for the given type; a value of 255
 *     indicates an error.
 */
function getByteSize( type )
{
  if( type === uint8 || type === int8 ) return 1;
  if( type === uint16 || type === int16 ) return 2;
  if( type === uint24 || type === int24 ) return 3;

  //---* Impossible as advertisements are much smaller *-----------------------
  return 255;
}   //  getByteSize()

/**
 * Functions for decoding and unpacking the service data from Shelly BLU
 * devices.
 */
let BTHomeDecoder =
{
  utoi: function( num, bitsz )
  {
    let mask = 1 << (bitsz - 1);
    return num & mask ? num - (1 << bitsz) : num;
  },

  getUInt8: function( buffer )
  {
    return buffer.at( 0 );
  },

  getInt8: function( buffer )
  {
    return this.utoi( this.getUInt8( buffer ), 8 );
  },

  getUInt16LE: function( buffer )
  {
    return 0xffff & ((buffer.at( 1 ) << 8) | buffer.at( 0 ));
  },

  getInt16LE: function( buffer )
  {
    return this.utoi( this.getUInt16LE( buffer ), 16 );
  },

  getUInt24LE: function( buffer )
  {
    return ( 0x00ffffff & ((buffer.at( 2 ) << 16) | (buffer.at( 1 ) << 8) | buffer.at( 0 ) ) );
  },

  getInt24LE: function( buffer )
  {
    return this.utoi( this.getUInt24LE( buffer ), 24 );
  },

  getBufValue: function( type, buffer )
  {
    if( buffer.length < getByteSize( type ) ) return null;
    let res = null;
    if( type === uint8 ) res = this.getUInt8( buffer );
    if( type === int8 ) res = this.getInt8( buffer );
    if( type === uint16 ) res = this.getUInt16LE( buffer );
    if( type === int16 ) res = this.getInt16LE( buffer );
    if( type === uint24 ) res = this.getUInt24LE( buffer );
    if( type === int24 ) res = this.getInt24LE( buffer );
    return res;
  },

  /**
   * Unpacks the service data buffer from a Shelly BLU device.
   *
   * @param {String} buffer – The data from the Shelly BLUE device.
   */
  unpack: function( buffer )
  {
    /*
     * Beacons might not provide BTH service data!
     */
    if( typeof buffer !== "string" || buffer.length === 0 ) return null;
    let result = {};
    let _dib = buffer.at( 0 );
    result ["encryption"] = _dib & 0x1 ? true : false;
    result ["BTHome_version"] = _dib >> 5;
    if( result ["BTHome_version"] !== 2 ) return null;

    //---* We cannot handle encrypted data *-----------------------------------
    if (result["encryption"]) return result;

    buffer = buffer.slice( 1 );

    let _bth;
    let _value;
    while( buffer.length > 0 )
    {
      _bth = BTH [buffer.at( 0 )];
      if( typeof _bth === "undefined" )
      {
        logger( "unknown type", "BTH" );
        break;
      }

      buffer = buffer.slice( 1 );
      _value = this.getBufValue( _bth.t, buffer );
      if( _value === null ) break;
      if( typeof _bth.f !== "undefined" ) _value = _value * _bth.f;
      result [_bth.n] = _value;
      buffer = buffer.slice( getByteSize( _bth.t ) );
    }
    return result;
  },
};

/**
 * The handler that is called when a data package was received.
 *
 * @param {Object} data – The data package.
 */
function onReceivedPacket( data )
{
  if( CONFIG._processedMacAddresses !== null )
  {
    if( CONFIG._processedMacAddresses.indexOf( data.address ) < 0 )
    {
      logger( ["Received event from", data.address, "outside of the allowed addresses"], "Info" );
      return;
    }
  }

  if( typeof CONFIG.motionHandler === "function" && typeof data.motion !== "undefined" )
  {
    CONFIG.motionHandler( data.motion === 1, data );
    logger( "Motion handler called", "Info" );
  }

  if( typeof CONFIG.illuminanceHandler === "function" && typeof data.illuminance !== "undefined" )
  {
    CONFIG.illuminanceHandler( data.illuminance, data );
    logger( "Illuminance handler called", "Info" );
  }

  if( typeof CONFIG.onStatusUpdate === "function" )
  {
    CONFIG.onStatusUpdate( data );
    logger( "New status update", "Info" );
  }
}   //  onReceivedPacket()

/*
 * We are saving the id of the last packet here; this is used to filter on
 * duplicate packets.
 */
let lastPacketId = 0x100;

/*
 * The Callback for the BLE scanner object.
 *
 * @param {Object} event –
 * @param {Object} result –
 */
function BLEScanCallback( event, result )
{
  //---* exit if not a result of a scan *--------------------------------------
  if( event !== BLE.Scanner.SCAN_RESULT )
  {
    return;
  }

  //---* exit if service_data member is missing *------------------------------
  if( typeof result.service_data === "undefined" || typeof result.service_data [BTHOME_SVC_ID_STR] === "undefined" )
  {
    return;
  }

  let unpackedData = BTHomeDecoder.unpack( result.service_data [BTHOME_SVC_ID_STR] );

  //---* exit if unpacked data is null or the device is encrypted *------------
  if( unpackedData === null || typeof unpackedData === "undefined" || unpackedData ["encryption"] )
  {
    logger( "Encrypted devices are not supported", "Error" );
    return;
  }

  //---* exit if the event is duplicated *-------------------------------------
  if( lastPacketId === unpackedData.pid )
  {
    return;
  }

  lastPacketId = unpackedData.pid;

  unpackedData.rssi = result.rssi;
  unpackedData.address = result.addr;

  //---* Call the handler *----------------------------------------------------
  onReceivedPacket( unpackedData );
}   //  BLEScanCallback()

/**
 * Initializes the script and performs the necessary checks and configurations.
 */
function init()
{
  //---* exit if can't find the config *---------------------------------------
  if( typeof CONFIG === "undefined" )
  {
    console.log("Error: Undefined config");
    return;
  }

  //---* Get the config of the BLE component *---------------------------------
  let BLEConfig = Shelly.getComponentConfig( "ble" );

  //---* exit if the BLE isn't enabled *---------------------------------------
  if( !BLEConfig.enable )
  {
    console.log( "Error: The Bluetooth is not enabled, please enable it from settings" );
    return;
  }

  //---* check if the scanner is already running *-----------------------------
  if( BLE.Scanner.isRunning() )
  {
    console.log( "Info: The BLE gateway is running, the BLE scan configuration is managed by the device" );
  }
  else
  {
    //---* Start the scanner *-------------------------------------------------
    let bleScanner = BLE.Scanner.Start(
    {
        duration_ms: BLE.Scanner.INFINITE_SCAN,
        active: CONFIG.active
    });

    if( !bleScanner )
    {
      console.log( "Error: Can not start new scanner" );
    }
  }

  if ( typeof CONFIG.allowedMacAddresses !== "undefined" )
  {
    if( CONFIG.allowedMacAddresses !== null )
    {
      /*
       * Process configured mac addresses all to lower case and remove any
       * duplicates.
       */
      CONFIG._processedMacAddresses =
        CONFIG
          .allowedMacAddresses
          .map( function( mac ) { return mac.toLowerCase(); } )
          .filter( function( value, index, array ) { return array.indexOf(value) === index; } )
    }
    else
    {
      CONFIG._processedMacAddresses = null;
    }
  }

  //---* Subscribe a callback to BLE scanner *---------------------------------
  BLE.Scanner.Subscribe( BLEScanCallback );
}   //  init()

//---* Of we go go! *----------------------------------------------------------
init();

/*
 * End of script!
 */