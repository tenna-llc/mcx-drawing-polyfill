/*!
 * MCX Drawing Polyfill — Test Suite
 * Tests for attach/detach lifecycle, map settings restoration, and shape types
 */

(function ()
{
    'use strict';

    // Test harness
    var TestRunner = {
        tests: [],
        passed: 0,
        failed: 0,

        test: function (name, fn)
        {
            this.tests.push({ name: name, fn: fn });
        },

        run: async function ()
        {
            console.log('=== MCX Drawing Polyfill Test Suite ===\n');

            for (var i = 0; i < this.tests.length; i++)
            {
                var test = this.tests[i];
                try
                {
                    await test.fn();
                    this.passed++;
                    console.log('✓ PASS: ' + test.name);
                } catch (err)
                {
                    this.failed++;
                    console.error('✗ FAIL: ' + test.name);
                    console.error('  Error: ' + err.message);
                    if (err.stack) console.error('  Stack: ' + err.stack);
                }
            }

            console.log('\n=== Test Results ===');
            console.log('Passed: ' + this.passed);
            console.log('Failed: ' + this.failed);
            console.log('Total: ' + (this.passed + this.failed));

            if (this.failed === 0)
            {
                console.log('\n🎉 All tests passed!');
            } else
            {
                console.error('\n❌ ' + this.failed + ' test(s) failed.');
            }
        }
    };

    // Utility: assert equal
    function assertEqual(actual, expected, message)
    {
        if (actual !== expected)
        {
            throw new Error((message || '') + ' Expected ' + expected + ' but got ' + actual);
        }
    }

    // Utility: assert true
    function assertTrue(value, message)
    {
        if (!value)
        {
            throw new Error(message || 'Expected value to be true');
        }
    }

    // Utility: assert false
    function assertFalse(value, message)
    {
        if (value)
        {
            throw new Error(message || 'Expected value to be false');
        }
    }

    // Utility: create a mock Google Maps Map (mimics real map API with get/set)
    function createMockMap()
    {
        var options = {};
        return {
            getDiv: function () { return document.createElement('div'); },
            get: function (key) { return options[key]; },
            set: function (key, value) { options[key] = value; },
            setOptions: function (opts)
            {
                Object.assign(options, opts);
            },
            addListener: function (event, callback) { return 1; },
            removeListener: function (listener) { }
        };
    }

    // ── Tests ──────────────────────────────────────────

    TestRunner.test('DrawingManager attaches to map', function ()
    {
        var map = createMockMap();
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        assertEqual(manager.getMap(), map, 'Manager should be attached to the map');
    });

    TestRunner.test('DrawingManager detaches from map', function ()
    {
        var map = createMockMap();
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        manager.setMap(null);
        assertEqual(manager.getMap(), null, 'Manager should be detached from the map');
    });

    TestRunner.test('Map settings are saved and restored on drawing mode', function ()
    {
        var map = createMockMap();
        map.setOptions({
            gestureHandling: 'greedy',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        var originalSettings = map.getOptions();
        assertEqual(originalSettings.gestureHandling, 'greedy', 'Original gestureHandling should be greedy');
        assertFalse(originalSettings.disableDoubleClickZoom, 'Original disableDoubleClickZoom should be false');

        // Enter marker mode
        manager.setDrawingMode('marker');
        var drawingSettings = map.getOptions();
        assertEqual(drawingSettings.gestureHandling, 'auto', 'gestureHandling should be auto while drawing marker');
        assertTrue(drawingSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be true while drawing');

        // Exit drawing mode
        manager.setDrawingMode(null);
        var restoredSettings = map.getOptions();
        assertEqual(restoredSettings.gestureHandling, 'greedy', 'Original gestureHandling should be restored');
        assertFalse(restoredSettings.disableDoubleClickZoom, 'Original disableDoubleClickZoom should be restored');
    });

    TestRunner.test('Map settings are saved when entering drag-shape mode', function ()
    {
        var map = createMockMap();
        map.setOptions({
            gestureHandling: 'cooperative',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        // Enter circle mode (drag-shape mode)
        manager.setDrawingMode('circle');
        var drawingSettings = map.getOptions();
        assertEqual(drawingSettings.gestureHandling, 'none', 'gestureHandling should be none for drag-shape modes');
        assertTrue(drawingSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be true while drawing');

        // Exit drawing mode
        manager.setDrawingMode(null);
        var restoredSettings = map.getOptions();
        assertEqual(restoredSettings.gestureHandling, 'cooperative', 'Original gestureHandling should be restored');
        assertFalse(restoredSettings.disableDoubleClickZoom, 'Original disableDoubleClickZoom should be restored');
    });

    TestRunner.test('Rectangle mode also disables gestures', function ()
    {
        var map = createMockMap();
        map.setOptions({
            gestureHandling: 'auto',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        // Enter rectangle mode (drag-shape mode)
        manager.setDrawingMode('rectangle');
        var drawingSettings = map.getOptions();
        assertEqual(drawingSettings.gestureHandling, 'none', 'gestureHandling should be none for rectangle mode');
        assertTrue(drawingSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be true while drawing');

        // Exit drawing mode
        manager.setDrawingMode(null);
        var restoredSettings = map.getOptions();
        assertEqual(restoredSettings.gestureHandling, 'auto', 'Original gestureHandling should be restored');
    });

    TestRunner.test('Marker fires overlaycomplete with correct type', function ()
    {
        return new Promise(function (resolve, reject)
        {
            var map = createMockMap();
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false,
                drawingMode: 'marker'
            });

            var completed = false;
            google.maps.event.addListenerOnce(manager, 'overlaycomplete', function (event)
            {
                try
                {
                    assertTrue(event.overlay instanceof google.maps.Marker, 'Overlay should be a Marker');
                    assertEqual(event.type, 'marker', 'Event type should be marker');
                    completed = true;
                    resolve();
                } catch (err)
                {
                    reject(err);
                }
            });

            // Simulate map click at marker mode
            manager._handleMapClick({ latLng: new google.maps.LatLng(40.7128, -74.0060) });
        });
    });

    TestRunner.test('Polyline fires overlaycomplete with correct type', function ()
    {
        return new Promise(function (resolve, reject)
        {
            var map = createMockMap();
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false
            });

            var completed = false;
            google.maps.event.addListenerOnce(manager, 'overlaycomplete', function (event)
            {
                try
                {
                    assertTrue(event.overlay instanceof google.maps.Polyline, 'Overlay should be a Polyline');
                    assertEqual(event.type, 'polyline', 'Event type should be polyline');
                    completed = true;
                    resolve();
                } catch (err)
                {
                    reject(err);
                }
            });

            manager.setDrawingMode('polyline');

            // Simulate two clicks to form a polyline
            manager._handleMapClick({ latLng: new google.maps.LatLng(40.7128, -74.0060) });
            manager._handleMapClick({ latLng: new google.maps.LatLng(40.7580, -73.9855) });

            // Click the finishing marker to complete
            manager._handleFinishingNodeClick();
        });
    });

    TestRunner.test('Polygon fires overlaycomplete with correct type', function ()
    {
        return new Promise(function (resolve, reject)
        {
            var map = createMockMap();
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false
            });

            var completed = false;
            google.maps.event.addListenerOnce(manager, 'overlaycomplete', function (event)
            {
                try
                {
                    assertTrue(event.overlay instanceof google.maps.Polygon, 'Overlay should be a Polygon');
                    assertEqual(event.type, 'polygon', 'Event type should be polygon');
                    completed = true;
                    resolve();
                } catch (err)
                {
                    reject(err);
                }
            });

            manager.setDrawingMode('polygon');

            // Simulate three clicks to form a polygon
            manager._handleMapClick({ latLng: new google.maps.LatLng(40.7128, -74.0060) });
            manager._handleMapClick({ latLng: new google.maps.LatLng(40.7580, -73.9855) });
            manager._handleMapClick({ latLng: new google.maps.LatLng(40.7489, -73.9680) });

            // Click the finishing marker to complete
            manager._handleFinishingNodeClick();
        });
    });

    TestRunner.test('Circle fires overlaycomplete with correct type', function ()
    {
        return new Promise(function (resolve, reject)
        {
            var map = createMockMap();
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false
            });

            var completed = false;
            google.maps.event.addListenerOnce(manager, 'overlaycomplete', function (event)
            {
                try
                {
                    assertTrue(event.overlay instanceof google.maps.Circle, 'Overlay should be a Circle');
                    assertEqual(event.type, 'circle', 'Event type should be circle');
                    completed = true;
                    resolve();
                } catch (err)
                {
                    reject(err);
                }
            });

            manager.setDrawingMode('circle');

            // Simulate drag draw
            manager._shapeDown({ latLng: new google.maps.LatLng(40.7128, -74.0060) });
            manager._shapeMove({ latLng: new google.maps.LatLng(40.7200, -74.0060) });
            manager._shapeUp();
        });
    });

    TestRunner.test('Rectangle fires overlaycomplete with correct type', function ()
    {
        return new Promise(function (resolve, reject)
        {
            var map = createMockMap();
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false
            });

            var completed = false;
            google.maps.event.addListenerOnce(manager, 'overlaycomplete', function (event)
            {
                try
                {
                    assertTrue(event.overlay instanceof google.maps.Rectangle, 'Overlay should be a Rectangle');
                    assertEqual(event.type, 'rectangle', 'Event type should be rectangle');
                    completed = true;
                    resolve();
                } catch (err)
                {
                    reject(err);
                }
            });

            manager.setDrawingMode('rectangle');

            // Simulate drag draw
            manager._shapeDown({ latLng: new google.maps.LatLng(40.7128, -74.0060) });
            manager._shapeMove({ latLng: new google.maps.LatLng(40.7200, -74.0100) });
            manager._shapeUp();
        });
    });

    TestRunner.test('Rectangle draws with proper bounds and geometry', function ()
    {
        return new Promise(function (resolve, reject)
        {
            var map = createMockMap();
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false,
                rectangleOptions: {
                    strokeColor: '#FF0000',
                    fillColor: '#FF0000',
                    fillOpacity: 0.2
                }
            });

            google.maps.event.addListenerOnce(manager, 'overlaycomplete', function (event)
            {
                try
                {
                    assertTrue(event.overlay instanceof google.maps.Rectangle, 'Overlay should be a Rectangle');
                    assertEqual(event.type, 'rectangle', 'Event type should be rectangle');

                    // Verify rectangle has bounds
                    var bounds = event.overlay.getBounds();
                    assertTrue(bounds !== null, 'Rectangle should have bounds');

                    // Verify we can get NE and SW corners
                    var ne = bounds.getNorthEast();
                    var sw = bounds.getSouthWest();
                    assertTrue(ne !== null, 'NorthEast corner should exist');
                    assertTrue(sw !== null, 'SouthWest corner should exist');

                    // Verify rectangle can be made editable and draggable
                    event.overlay.setOptions({ editable: true, draggable: true });
                    assertTrue(event.overlay.get('editable') === true, 'Rectangle should be editable');
                    assertTrue(event.overlay.get('draggable') === true, 'Rectangle should be draggable');

                    resolve();
                } catch (err)
                {
                    reject(err);
                }
            });

            manager.setDrawingMode('rectangle');

            // Simulate drag draw from top-left to bottom-right
            var topLeft = new google.maps.LatLng(40.7200, -74.0100);
            var bottomRight = new google.maps.LatLng(40.7128, -74.0060);

            manager._shapeDown({ latLng: topLeft });
            manager._shapeMove({ latLng: bottomRight });
            manager._shapeUp();
        });
    });

    TestRunner.test('Drawing mode can be changed between different modes', function ()
    {
        var map = createMockMap();
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        manager.setDrawingMode('marker');
        assertEqual(manager.getDrawingMode(), 'marker', 'Should be in marker mode');

        manager.setDrawingMode('polyline');
        assertEqual(manager.getDrawingMode(), 'polyline', 'Should be in polyline mode');

        manager.setDrawingMode('polygon');
        assertEqual(manager.getDrawingMode(), 'polygon', 'Should be in polygon mode');

        manager.setDrawingMode('circle');
        assertEqual(manager.getDrawingMode(), 'circle', 'Should be in circle mode');

        manager.setDrawingMode('rectangle');
        assertEqual(manager.getDrawingMode(), 'rectangle', 'Should be in rectangle mode');

        manager.setDrawingMode(null);
        assertEqual(manager.getDrawingMode(), null, 'Should be in pan mode');
    });

    TestRunner.test('Map settings are restored when detaching while drawing', function ()
    {
        var map = createMockMap();
        map.setOptions({
            gestureHandling: 'greedy',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        var originalSettings = map.setOptions({ gestureHandling: 'greedy', disableDoubleClickZoom: false });

        // Enter marker mode
        manager.setDrawingMode('marker');
        var drawingSettings = { gestureHandling: map.get('gestureHandling'), disableDoubleClickZoom: map.get('disableDoubleClickZoom') };
        assertEqual(drawingSettings.gestureHandling, 'auto', 'gestureHandling should be auto while drawing');
        assertTrue(drawingSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be true while drawing');

        // Detach while still in drawing mode
        manager.setMap(null);

        // Reattach to the same map
        manager.setMap(map);

        // Settings should have been restored during detach
        var restoredSettings = { gestureHandling: map.get('gestureHandling'), disableDoubleClickZoom: map.get('disableDoubleClickZoom') };
        assertEqual(restoredSettings.gestureHandling, 'greedy', 'gestureHandling should be restored after detach');
        assertFalse(restoredSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be restored after detach');
    });

    TestRunner.test('Map settings are undefined in original state', function ()
    {
        var map = createMockMap();
        // Map starts with no specific gestureHandling or disableDoubleClickZoom
        var originalSettings = map.getOptions();
        assertTrue(!originalSettings.gestureHandling || originalSettings.gestureHandling === undefined,
            'Original gestureHandling should be undefined or not set');

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        // Enter and exit drawing mode
        manager.setDrawingMode('marker');
        manager.setDrawingMode(null);

        // Settings should be restored to their original state
        var restoredSettings = map.getOptions();
        assertTrue(!restoredSettings.gestureHandling || restoredSettings.gestureHandling === undefined,
            'gestureHandling should be restored to original undefined state');
    });

    // Export for use in browsers
    window.MCXDrawingTestRunner = TestRunner;

    // Auto-run if in a test environment
    if (typeof module !== 'undefined' && module.exports)
    {
        module.exports = TestRunner;
    }

})();
