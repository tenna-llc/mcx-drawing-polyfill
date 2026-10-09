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
            console.log('=== MCX Drawing Polyfill Test Suite ===');
            console.log('Google Maps ' + google.maps.version + ' | Polyfill ' + google.maps.drawing.MCX_VERSION + '\n');

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

            hiddenMapContainers.forEach(function (el) { el.remove(); });
            hiddenMapContainers = [];

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

    // Utility: create a real Google Maps Map instance with option tracking
    var sharedTestMap = null;  // Single map shared across all tests
    var hiddenMapContainers = []; // Removed after the run, so tests needn't clean up

    // ── Drawing simulation helpers ──
    // The polyfill drops vertex clicks <150ms apart and pops the last vertex if the
    // finishing node is clicked <200ms after it, so simulated input is spaced out.
    var INPUT_GAP_MS = 250;

    function wait(ms)
    {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function ll(lat, lng)
    {
        return new google.maps.LatLng(lat, lng);
    }

    function newManager(map)
    {
        var manager = new google.maps.drawing.DrawingManager({ map: map, drawingControl: false, silent: true });
        var events = [];
        google.maps.event.addListener(manager, 'overlaycomplete', function (e) { events.push(e); });
        return { manager: manager, events: events };
    }

    async function clickMap(map, points)
    {
        for (var i = 0; i < points.length; i++)
        {
            google.maps.event.trigger(map, 'click', { latLng: points[i] });
            await wait(INPUT_GAP_MS);
        }
    }

    function clickFinishingNode(manager)
    {
        assertTrue(!!manager._finishingMarker, 'Finishing node should exist');
        google.maps.event.trigger(manager._finishingMarker, 'click');
    }

    function dragOnMap(map, from, to)
    {
        google.maps.event.trigger(map, 'mousedown', { latLng: from });
        google.maps.event.trigger(map, 'mousemove', { latLng: to });
        google.maps.event.trigger(map, 'mouseup', { latLng: to });
    }

    function assertSingleOverlay(events, type, ctor)
    {
        assertEqual(events.length, 1, 'Exactly one overlaycomplete should fire.');
        assertEqual(events[0].type, type, 'overlaycomplete type.');
        assertTrue(events[0].overlay instanceof ctor, 'Overlay should be a native google.maps ' + type);
        return events[0].overlay;
    }

    // Tests draw on hidden maps for isolation; afterwards move the polyfill's
    // finished shapes onto the visible "Live Map View" so they can be seen.
    function showOnLiveMap(overlays)
    {
        var liveMap = createRealMap(null, true);
        if (!liveMap) return;
        overlays.forEach(function (o)
        {
            if (o && typeof o.setMap === 'function') o.setMap(liveMap);
        });
    }

    function readSettings(map)
    {
        return {
            gestureHandling: map.get('gestureHandling'),
            disableDoubleClickZoom: map.get('disableDoubleClickZoom')
        };
    }

    function createRealMap(extraOptions, useShared)
    {
        // If useShared is true and we don't have a shared map yet, create it
        if (useShared && !sharedTestMap)
        {
            var mapContainer = document.getElementById('test-map');
            if (mapContainer)
            {
                sharedTestMap = new google.maps.Map(mapContainer, {
                    zoom: 12,
                    center: { lat: 37.7749, lng: -122.4194 }
                });
            }
        }

        // Return shared map if available and requested
        if (useShared && sharedTestMap) return sharedTestMap;

        // Otherwise create a hidden test map
        var mapContainer = document.createElement('div');
        mapContainer.style.width = '400px';
        mapContainer.style.height = '300px';
        mapContainer.style.display = 'none';
        document.body.appendChild(mapContainer);
        hiddenMapContainers.push(mapContainer);

        var opts = { zoom: 12, center: { lat: 37.7749, lng: -122.4194 } };
        if (extraOptions) Object.assign(opts, extraOptions);
        var map = new google.maps.Map(mapContainer, opts);

        // Store container reference for cleanup
        map._testContainer = mapContainer;
        return map;
    }

    // Utility: cleanup map
    function cleanupMap(map)
    {
        if (map && map._testContainer)
        {
            map._testContainer.remove();
        }
    }

    // ── Tests ──────────────────────────────────────────

    // Test 1: Lifecycle - Attach
    TestRunner.test('DrawingManager attaches to map', function ()
    {
        var map = createRealMap();
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        assertEqual(manager.getMap(), map, 'Manager should be attached to the map');
    });

    // Test 2: Lifecycle - Detach
    TestRunner.test('DrawingManager detaches from map', function ()
    {
        var map = createRealMap();
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        manager.setMap(null);
        assertEqual(manager.getMap(), null, 'Manager should be detached from the map');
    });

    TestRunner.test('Detaching mid-draw restores map settings and cursor', function ()
    {
        var map = createRealMap({ gestureHandling: 'greedy', disableDoubleClickZoom: false });
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        manager.setDrawingMode('circle');
        assertEqual(map.get('gestureHandling'), 'greedy', 'Selecting a tool should leave gestureHandling alone');
        google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) });
        assertEqual(map.get('gestureHandling'), 'none', 'gestureHandling should be none while dragging a circle');

        manager.setMap(null);
        var restored = readSettings(map);
        assertEqual(restored.gestureHandling, 'greedy', 'gestureHandling should be restored after detach');
        assertFalse(restored.disableDoubleClickZoom, 'disableDoubleClickZoom should be restored after detach');
        assertEqual(map.get('draggableCursor'), '', 'Crosshair cursor should be cleared after detach');
        assertEqual(map.getDiv().style.cursor, '', 'Map container cursor should be cleared after detach');
        cleanupMap(map);
    });

    // Test 3: Settings Preservation - Marker mode
    TestRunner.test('Map settings are saved and restored on drawing mode', function ()
    {
        var map = createRealMap();
        map.setOptions({
            gestureHandling: 'greedy',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        var originalSettings = readSettings(map);
        assertEqual(originalSettings.gestureHandling, 'greedy', 'Original gestureHandling should be greedy');
        assertFalse(originalSettings.disableDoubleClickZoom, 'Original disableDoubleClickZoom should be false');

        // Enter marker mode
        manager.setDrawingMode('marker');
        var drawingSettings = readSettings(map);
        assertEqual(drawingSettings.gestureHandling, 'greedy', 'gestureHandling should be left alone while drawing marker');
        assertTrue(drawingSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be true while drawing');

        // Exit drawing mode
        manager.setDrawingMode(null);
        var restoredSettings = readSettings(map);
        assertEqual(restoredSettings.gestureHandling, 'greedy', 'gestureHandling should be restored to greedy');
        assertFalse(restoredSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be restored to false');
    });

    // Test 4: Settings Preservation - Circle mode (drag-shape)
    TestRunner.test('Map settings are saved when entering drag-shape mode', function ()
    {
        var map = createRealMap();
        map.setOptions({
            gestureHandling: 'cooperative',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        // Enter circle mode
        manager.setDrawingMode('circle');
        var drawingSettings = readSettings(map);
        assertEqual(drawingSettings.gestureHandling, 'cooperative', 'gestureHandling should be left alone until a drag starts');
        assertTrue(drawingSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be true while drawing');

        // Exit drawing mode
        manager.setDrawingMode(null);
        var restoredSettings = readSettings(map);
        assertEqual(restoredSettings.gestureHandling, 'cooperative', 'gestureHandling should be restored to cooperative');
        assertFalse(restoredSettings.disableDoubleClickZoom, 'disableDoubleClickZoom should be restored to false');
    });

    // Test 5: Settings Preservation - Rectangle mode
    TestRunner.test('Rectangle mode leaves gestures alone until a drag', function ()
    {
        var map = createRealMap();
        map.setOptions({
            gestureHandling: 'auto',
            disableDoubleClickZoom: false
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        // Enter rectangle mode
        manager.setDrawingMode('rectangle');
        var drawingSettings = readSettings(map);
        assertEqual(drawingSettings.gestureHandling, 'auto', 'gestureHandling should be left alone for rectangle');

        // Exit and verify restoration
        manager.setDrawingMode(null);
        var restoredSettings = readSettings(map);
        assertEqual(restoredSettings.gestureHandling, 'auto', 'gestureHandling should be restored to auto');
    });

    // Test 6: Panning is locked only while a circle/rectangle is being dragged (as in Google)
    TestRunner.test('Panning is locked only during a circle or rectangle drag', function ()
    {
        var map = createRealMap();
        map.setOptions({
            gestureHandling: 'greedy'
        });

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        ['circle', 'rectangle'].forEach(function (mode)
        {
            manager.setDrawingMode(mode);
            assertEqual(readSettings(map).gestureHandling, 'greedy', mode + ': map stays pannable/zoomable while the tool is only selected');

            google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) });
            assertEqual(readSettings(map).gestureHandling, 'none', mode + ': gestures locked during the drag');

            google.maps.event.trigger(map, 'mouseup', { latLng: ll(37.77, -122.42) });
            assertEqual(readSettings(map).gestureHandling, 'greedy', mode + ': original gestureHandling back after the drag');
        });

        manager.setDrawingMode(null);
        assertEqual(readSettings(map).gestureHandling, 'greedy', 'gestureHandling unchanged after leaving the tool');
        cleanupMap(map);
    });

    TestRunner.test('Switching tools mid-drag puts gestureHandling back', function ()
    {
        var map = createRealMap();
        map.setOptions({ gestureHandling: 'greedy' });
        var manager = new google.maps.drawing.DrawingManager({ map: map, drawingControl: false });
        var completed = 0;
        google.maps.event.addListener(manager, 'overlaycomplete', function () { completed++; });

        manager.setDrawingMode('circle');
        google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) });
        google.maps.event.trigger(map, 'mousemove', { latLng: ll(37.775, -122.42) });
        assertEqual(readSettings(map).gestureHandling, 'none', 'Gestures locked during the drag');

        manager.setDrawingMode('marker');
        assertEqual(readSettings(map).gestureHandling, 'greedy', 'Original gestureHandling back after switching tools mid-drag');

        // The release of the abandoned drag must not finish a circle or lock again
        google.maps.event.trigger(map, 'mouseup', { latLng: ll(37.775, -122.42) });
        assertEqual(readSettings(map).gestureHandling, 'greedy', 'gestureHandling still original after the release');
        assertEqual(completed, 0, 'The abandoned circle must not be completed');

        manager.setDrawingMode(null);
        cleanupMap(map);
    });

    TestRunner.test('Host changes made while drawing are not overwritten, and the original cursor comes back', function ()
    {
        var map = createRealMap({ draggableCursor: 'help', disableDoubleClickZoom: false });
        var div = map.getDiv();
        div.style.cursor = 'move';
        var manager = new google.maps.drawing.DrawingManager({ map: map, drawingControl: false });

        manager.setDrawingMode('marker');
        assertTrue(String(map.get('draggableCursor')).indexOf('crosshair') !== -1, 'Crosshair while a tool is active');
        manager.setDrawingMode(null);
        assertEqual(map.get('draggableCursor'), 'help', 'The host draggableCursor should be restored');
        assertEqual(div.style.cursor, 'move', 'The host container cursor should be restored');

        manager.setDrawingMode('marker');
        map.setOptions({ draggableCursor: 'wait', disableDoubleClickZoom: false });
        manager.setDrawingMode(null);
        assertEqual(map.get('draggableCursor'), 'wait', 'A cursor the host set mid-draw must be kept');
        assertFalse(map.get('disableDoubleClickZoom'), 'A disableDoubleClickZoom the host set mid-draw must be kept');

        manager.setDrawingMode('circle');
        google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) });
        google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) }); // a second route for the same press
        google.maps.event.trigger(map, 'mouseup', { latLng: ll(37.77, -122.42) });
        assertEqual(map.get('gestureHandling'), 'auto', 'A doubled press must restore the original gestureHandling exactly');

        manager.setDrawingMode(null);
        manager.setDrawingMode('marker');
        div.style.cursor = 'url(crosshair.png), auto';
        var hostCursor = div.style.cursor; // as the browser serialises it
        manager.setDrawingMode(null);
        assertEqual(div.style.cursor, hostCursor, 'A host cursor that merely contains "crosshair" must be kept');
        cleanupMap(map);
    });

    // Shape types: drive the polyfill with simulated map input and check what it emits
    TestRunner.test('Drawing a marker emits overlaycomplete with type marker', async function ()
    {
        var map = createRealMap();
        var t = newManager(map);
        var markerEvents = 0;
        google.maps.event.addListener(t.manager, 'markercomplete', function () { markerEvents++; });

        t.manager.setDrawingMode('marker');
        await clickMap(map, [ll(37.775, -122.418)]);

        var marker = assertSingleOverlay(t.events, 'marker', google.maps.Marker);
        assertTrue(marker.getPosition().equals(ll(37.775, -122.418)), 'Marker should be at the clicked point');
        assertEqual(markerEvents, 1, 'markercomplete should fire once.');
        assertEqual(t.manager.getDrawingMode(), null, 'Mode should return to pan after completion.');
        showOnLiveMap([marker]);
        cleanupMap(map);
    });

    TestRunner.test('Drawing a polyline emits overlaycomplete with type polyline', async function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        t.manager.setDrawingMode('polyline');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.41), ll(37.79, -122.42)]);
        clickFinishingNode(t.manager);

        var line = assertSingleOverlay(t.events, 'polyline', google.maps.Polyline);
        assertEqual(line.getPath().getLength(), 3, 'Polyline should have 3 vertices.');
        assertEqual(t.manager.getDrawingMode(), null, 'Mode should return to pan after completion.');
        showOnLiveMap([line]);
        cleanupMap(map);
    });

    TestRunner.test('Drawing a polygon emits overlaycomplete with type polygon', async function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42), ll(37.78, -122.41)]);
        clickFinishingNode(t.manager);

        var polygon = assertSingleOverlay(t.events, 'polygon', google.maps.Polygon);
        assertEqual(polygon.getPath().getLength(), 3, 'Polygon should have 3 vertices.');
        assertEqual(t.manager.getDrawingMode(), null, 'Mode should return to pan after completion.');
        showOnLiveMap([polygon]);
        cleanupMap(map);
    });

    // Points around a centre; radii alternate per point (one radius = regular polygon)
    function ringPoints(lat, lng, radii, count)
    {
        var pts = [];
        for (var i = 0; i < count; i++)
        {
            var angle = (Math.PI * 2 * i / count) - Math.PI / 2;
            var r = radii[i % radii.length];
            pts.push(ll(lat + r * Math.sin(angle), lng + r * Math.cos(angle)));
        }
        return pts;
    }

    async function drawPolygonAndCheck(points, label)
    {
        var map = createRealMap();
        var t = newManager(map);

        t.manager.setDrawingMode('polygon');
        await clickMap(map, points);
        clickFinishingNode(t.manager);

        var polygon = assertSingleOverlay(t.events, 'polygon', google.maps.Polygon);
        var path = polygon.getPath();
        assertEqual(path.getLength(), points.length, label + ' should keep every clicked vertex.');
        for (var i = 0; i < points.length; i++)
        {
            assertTrue(path.getAt(i).equals(points[i]), label + ' vertex ' + i + ' should match the click, in order');
        }
        showOnLiveMap([polygon]);
        cleanupMap(map);
    }

    TestRunner.test('Drawing a 7-sided polygon keeps all 7 vertices in order', async function ()
    {
        await drawPolygonAndCheck(ringPoints(37.80, -122.44, [0.01], 7), 'Heptagon');
    });

    TestRunner.test('Drawing a star (10-vertex concave polygon) keeps all vertices in order', async function ()
    {
        await drawPolygonAndCheck(ringPoints(37.80, -122.40, [0.012, 0.005], 10), 'Star');
    });

    TestRunner.test('Polygon with fewer than 3 points is not emitted', async function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42)]);
        clickFinishingNode(t.manager);

        assertEqual(t.events.length, 0, 'A 2-point polygon should be discarded.');
        cleanupMap(map);
    });

    TestRunner.test('Dragging a circle emits overlaycomplete with type circle', function ()
    {
        var map = createRealMap();
        var t = newManager(map);
        var from = ll(37.77, -122.42);
        var to = ll(37.775, -122.42);

        t.manager.setDrawingMode('circle');
        dragOnMap(map, from, to);

        var circle = assertSingleOverlay(t.events, 'circle', google.maps.Circle);
        assertTrue(circle.getCenter().equals(from), 'Circle should be centred on the drag start.');
        var expected = google.maps.drawing.MCXShapeUtils.metersBetween(from, to);
        assertTrue(Math.abs(circle.getRadius() - expected) < 1, 'Radius should match the drag distance.');
        assertEqual(map.get('gestureHandling'), 'auto', 'Panning should be restored after the circle completes.');
        showOnLiveMap([circle]);
        cleanupMap(map);
    });

    TestRunner.test('Dragging a rectangle emits overlaycomplete with type rectangle', function ()
    {
        var map = createRealMap();
        var t = newManager(map);
        var from = ll(37.77, -122.42);
        var to = ll(37.78, -122.41);

        t.manager.setDrawingMode('rectangle');
        dragOnMap(map, from, to);

        var rect = assertSingleOverlay(t.events, 'rectangle', google.maps.Rectangle);
        assertTrue(rect.getBounds().equals(new google.maps.LatLngBounds(from, to)), 'Bounds should match the drag.');
        assertEqual(map.get('gestureHandling'), 'auto', 'Panning should be restored after the rectangle completes.');
        showOnLiveMap([rect]);
        cleanupMap(map);
    });

    TestRunner.test('Shape being dragged has no resize handles; finished shape uses caller options', function ()
    {
        var map = createRealMap();
        var editableOpts = { editable: true, draggable: true, zIndex: 1000 };
        var manager = new google.maps.drawing.DrawingManager({
            map: map, drawingControl: false, silent: true,
            circleOptions: editableOpts, rectangleOptions: editableOpts
        });
        var events = [];
        google.maps.event.addListener(manager, 'overlaycomplete', function (e) { events.push(e); });

        ['circle', 'rectangle'].forEach(function (mode)
        {
            manager.setDrawingMode(mode);
            google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) });
            google.maps.event.trigger(map, 'mousemove', { latLng: ll(37.78, -122.41) });

            var preview = manager._shapePreview;
            assertFalse(preview.getEditable(), mode + ' preview should not be editable while dragging');
            assertFalse(preview.getDraggable(), mode + ' preview should not be draggable while dragging');

            google.maps.event.trigger(map, 'mouseup', { latLng: ll(37.78, -122.41) });
        });

        assertEqual(events.length, 2, 'Both shapes should be emitted.');
        events.forEach(function (e)
        {
            assertTrue(e.overlay.getEditable(), e.type + ' should be editable once complete');
            assertTrue(e.overlay.getDraggable(), e.type + ' should be draggable once complete');
            assertEqual(e.overlay.get('zIndex'), 1000, e.type + ' should use the caller zIndex once complete.');
        });
        cleanupMap(map);
    });

    // Touch safety net: releasing off the map must still finish the shape
    function startDrag(manager, map, mode)
    {
        manager.setDrawingMode(mode);
        google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42) });
        google.maps.event.trigger(map, 'mousemove', { latLng: ll(37.78, -122.41) });
    }

    TestRunner.test('Lifting a pointer off the map finishes the circle', function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        startDrag(t.manager, map, 'circle');
        document.dispatchEvent(new Event('pointerup'));

        assertSingleOverlay(t.events, 'circle', google.maps.Circle);
        cleanupMap(map);
    });

    TestRunner.test('Lifting a finger off the map finishes the rectangle', function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        startDrag(t.manager, map, 'rectangle');
        document.dispatchEvent(new Event('touchend'));

        assertSingleOverlay(t.events, 'rectangle', google.maps.Rectangle);
        cleanupMap(map);
    });

    TestRunner.test('An interrupted touch (touchcancel) discards the half-drawn shape', function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        startDrag(t.manager, map, 'circle');
        var preview = t.manager._shapePreview;
        document.dispatchEvent(new Event('touchcancel'));

        assertEqual(preview.getMap(), null, 'Preview should be removed from the map.');
        assertFalse(t.manager._shapeDragging, 'Drag should be over.');
        document.dispatchEvent(new Event('pointerup'));

        assertEqual(t.events.length, 0, 'No shape should be emitted after a cancel.');
        assertEqual(t.manager.getDrawingMode(), 'circle', 'Tool should stay active so the user can retry.');
        cleanupMap(map);
    });

    TestRunner.test('pointercancel does not discard a drag in progress', function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        startDrag(t.manager, map, 'circle');
        document.dispatchEvent(new Event('pointercancel'));
        assertTrue(t.manager._shapeDragging, 'Drag should continue after pointercancel.');

        document.dispatchEvent(new Event('touchend'));
        assertSingleOverlay(t.events, 'circle', google.maps.Circle);
        cleanupMap(map);
    });

    function fireOnDocument(type, props)
    {
        var ev = new Event(type);
        Object.keys(props || {}).forEach(function (k)
        {
            Object.defineProperty(ev, k, { value: props[k] });
        });
        document.dispatchEvent(ev);
    }

    TestRunner.test('A second finger lifting does not finish the shape', function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        startDrag(t.manager, map, 'circle');
        fireOnDocument('pointerup', { isPrimary: false });
        fireOnDocument('touchend', { touches: [{}] });
        assertTrue(t.manager._shapeDragging, 'Drag should continue while the drawing finger is down.');
        assertEqual(t.events.length, 0, 'No shape should be emitted yet.');

        fireOnDocument('touchend', { touches: [] });
        assertSingleOverlay(t.events, 'circle', google.maps.Circle);
        cleanupMap(map);
    });

    TestRunner.test('Only the left mouse button starts a circle', function ()
    {
        var map = createRealMap();
        var t = newManager(map);
        t.manager.setDrawingMode('circle');

        [1, 2].forEach(function (button)
        {
            google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42), domEvent: { button: button } });
            assertFalse(t.manager._shapeDragging, 'Mouse button ' + button + ' should not start a drag.');
        });

        google.maps.event.trigger(map, 'mousedown', { latLng: ll(37.77, -122.42), domEvent: { button: 0 } });
        assertTrue(t.manager._shapeDragging, 'Left button should start a drag.');
        google.maps.event.trigger(map, 'mouseup', {});
        cleanupMap(map);
    });

    TestRunner.test('Switching polygon -> circle -> pan restores the original touch-action', function ()
    {
        var map = createRealMap();
        var div = map.getDiv();
        div.style.touchAction = 'pan-y';
        var t = newManager(map);

        t.manager.setDrawingMode('polygon');
        assertEqual(div.style.touchAction, 'pan-y', 'Polygon mode should leave touch-action alone.');
        t.manager.setDrawingMode('circle');
        assertEqual(div.style.touchAction, 'none', 'Circle mode should block page scrolling.');
        t.manager.setDrawingMode(null);
        assertEqual(div.style.touchAction, 'pan-y', 'Original touch-action should be restored.');
        cleanupMap(map);
    });

    TestRunner.test('Circle/rectangle tools block page scrolling on the map; other tools do not', function ()
    {
        var map = createRealMap();
        var div = map.getDiv();
        div.style.touchAction = 'pan-y';
        var t = newManager(map);

        t.manager.setDrawingMode('circle');
        assertEqual(div.style.touchAction, 'none', 'touch-action should be none in circle mode.');

        t.manager.setDrawingMode('rectangle');
        assertEqual(div.style.touchAction, 'none', 'touch-action should stay none in rectangle mode.');

        t.manager.setDrawingMode('polygon');
        assertEqual(div.style.touchAction, 'pan-y', 'touch-action should be restored for polygon mode.');

        t.manager.setDrawingMode('circle');
        t.manager.setDrawingMode(null);
        assertEqual(div.style.touchAction, 'pan-y', 'touch-action should be restored when drawing ends.');
        cleanupMap(map);
    });

    TestRunner.test('Finishing a circle and detaching mid-draw both restore touch-action', function ()
    {
        var map = createRealMap();
        var div = map.getDiv();
        var original = div.style.touchAction;
        var t = newManager(map);

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.775, -122.42));
        assertEqual(div.style.touchAction, original, 'touch-action should be restored after the circle completes.');

        t.manager.setDrawingMode('rectangle');
        t.manager.setMap(null);
        assertEqual(div.style.touchAction, original, 'touch-action should be restored after detach.');
        cleanupMap(map);
    });

    TestRunner.test('Detaching removes the page-level release listeners', function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        assertEqual(t.manager._docListeners.length, 4, 'Release listeners should be registered on attach.');
        t.manager.setMap(null);
        assertEqual(t.manager._docListeners, null, 'Release listeners should be removed on detach.');
        cleanupMap(map);
    });

    TestRunner.test('Polyfill reports the Tenna fork version', function ()
    {
        assertEqual(google.maps.drawing.MCX_VERSION, '2.0.0-tenna.5', 'MCX_VERSION.');
    });

    // ── Shape options applied to the finished overlay ──
    function managerWithOptions(map, opts)
    {
        var manager = new google.maps.drawing.DrawingManager(
            Object.assign({ map: map, drawingControl: false, silent: true }, opts));
        var events = [];
        google.maps.event.addListener(manager, 'overlaycomplete', function (e) { events.push(e); });
        return { manager: manager, events: events };
    }

    function drawCircleAndRectangle(t, map)
    {
        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.775, -122.42));
        t.manager.setDrawingMode('rectangle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.78, -122.41));
        assertEqual(t.events.length, 2, 'Circle and rectangle should both be emitted.');
        return t.events.map(function (e) { return e.overlay; });
    }

    TestRunner.test('editable: false and draggable: false are honoured on finished circle/rectangle', function ()
    {
        var map = createRealMap();
        var off = { editable: false, draggable: false };
        var t = managerWithOptions(map, { circleOptions: off, rectangleOptions: off });

        drawCircleAndRectangle(t, map).forEach(function (o, i)
        {
            var type = t.events[i].type;
            assertFalse(o.getEditable(), type + ' should not be editable.');
            assertFalse(o.getDraggable(), type + ' should not be draggable.');
        });
        cleanupMap(map);
    });

    TestRunner.test('Finished circle/rectangle follow Google defaults: not editable/draggable, clickable', function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, {});

        drawCircleAndRectangle(t, map).forEach(function (o, i)
        {
            var type = t.events[i].type;
            assertFalse(o.getEditable(), type + ' should not be editable by default');
            assertFalse(o.getDraggable(), type + ' should not be draggable by default');
            assertTrue(o.get('clickable') === true, type + ' should be clickable by default');
        });
        cleanupMap(map);
    });

    TestRunner.test('The finishing node follows the shape stroke, not a hard-coded blue', async function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, { polygonOptions: { strokeColor: '#ff0000' } });
        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42)]);
        assertEqual(t.manager._finishingMarker.get('icon').strokeColor, '#ff0000', 'Node should use the polygon stroke');
        cleanupMap(map);

        var map2 = createRealMap();
        var t2 = managerWithOptions(map2, {});
        t2.manager.setDrawingMode('polyline');
        await clickMap(map2, [ll(37.77, -122.42)]);
        assertEqual(t2.manager._finishingMarker.get('icon').strokeColor, '#000000', 'Default node should be black like Google shapes');
        cleanupMap(map2);
    });

    TestRunner.test('Line to the cursor is solid in the polygon stroke unless ghostlineOptions overrides', async function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, { polygonOptions: { strokeColor: '#ff0000', strokeWeight: 4 } });

        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42)]);
        google.maps.event.trigger(map, 'mousemove', { latLng: ll(37.78, -122.41) });

        var guide = t.manager._ghostLine;
        assertTrue(!!guide, 'Guide line should exist after moving the cursor');
        assertEqual(guide.get('strokeColor'), '#ff0000', 'Guide line uses the polygon strokeColor.');
        assertEqual(guide.get('strokeWeight'), 4, 'Guide line uses the polygon strokeWeight.');
        assertEqual((guide.get('icons') || []).length, 0, 'Guide line should be solid (no dot icons).');
        assertEqual(t.manager._activeShape.get('strokeColor'), '#ff0000', 'Placed edges use the polygon strokeColor.');
        t.manager.setDrawingMode(null);
        cleanupMap(map);
    });

    // Visual check on the Live Map View: red/blue/yellow/green shapes are drawn
    // by the polyfill with no zIndex set, so it numbers them 0..3. The purple polygon + teal circle (bottom
    // right) are plain Maps shapes with no zIndex, for comparison.
    TestRunner.test('Custom colours apply and finished shapes are numbered in drawing order', async function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, {
            polygonOptions: { strokeColor: '#d32f2f', strokeWeight: 2, fillColor: '#d32f2f', fillOpacity: 0.6 },
            circleOptions: { strokeColor: '#1976d2', strokeWeight: 2, fillColor: '#1976d2', fillOpacity: 0.6 },
            rectangleOptions: { strokeColor: '#388e3c', strokeWeight: 2, fillColor: '#388e3c', fillOpacity: 0.6 }
        });

        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.750, -122.455), ll(37.762, -122.455), ll(37.756, -122.440)]);
        clickFinishingNode(t.manager);

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.756, -122.447), ll(37.760, -122.447));

        // setOptions mid-session restyles the next polygon
        t.manager.setOptions({ polygonOptions: { strokeColor: '#f9a825', fillColor: '#f9a825' } });
        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.752, -122.446), ll(37.760, -122.446), ll(37.756, -122.436)]);
        clickFinishingNode(t.manager);

        t.manager.setDrawingMode('rectangle');
        dragOnMap(map, ll(37.753, -122.444), ll(37.759, -122.438));

        var expected = [
            ['polygon', '#d32f2f'], ['circle', '#1976d2'], ['polygon', '#f9a825'], ['rectangle', '#388e3c']
        ];
        assertEqual(t.events.length, 4, 'Four shapes should be emitted.');
        t.events.forEach(function (e, i)
        {
            assertEqual(e.type, expected[i][0], 'Shape ' + i + ' type.');
            assertEqual(e.overlay.get('strokeColor'), expected[i][1], e.type + ' ' + i + ' strokeColor.');
            assertEqual(e.overlay.get('fillColor'), expected[i][1], e.type + ' ' + i + ' fillColor.');
            assertEqual(e.overlay.get('fillOpacity'), 0.6, e.type + ' ' + i + ' fillOpacity.');
            assertEqual(e.overlay.get('zIndex'), i, e.type + ' ' + i + ' zIndex should be its drawing order.');
        });
        showOnLiveMap(t.events.map(function (e) { return e.overlay; }));

        // Control: polygon first, then circle, both created directly by Maps
        var style = { strokeWeight: 2, fillOpacity: 0.6 };
        showOnLiveMap([
            new google.maps.Polygon(Object.assign({
                paths: [ll(37.738, -122.436), ll(37.748, -122.436), ll(37.743, -122.424)],
                strokeColor: '#7b1fa2', fillColor: '#7b1fa2'
            }, style)),
            new google.maps.Circle(Object.assign({
                center: ll(37.743, -122.430), radius: 450,
                strokeColor: '#00897b', fillColor: '#00897b'
            }, style))
        ]);
        cleanupMap(map);
    });

    TestRunner.test('ghostlineOptions with dot icons keeps a dotted line (no solid stroke under it)', async function ()
    {
        var map = createRealMap();
        var dots = [{ icon: { path: google.maps.SymbolPath.CIRCLE, scale: 2 }, offset: '0', repeat: '4px' }];
        var t = managerWithOptions(map, { polylineOptions: { strokeColor: '#ff0000' }, ghostlineOptions: { icons: dots } });

        t.manager.setDrawingMode('polyline');
        await clickMap(map, [ll(37.77, -122.42)]);
        google.maps.event.trigger(map, 'mousemove', { latLng: ll(37.78, -122.41) });

        var guide = t.manager._ghostLine;
        assertEqual(guide.get('strokeOpacity'), 0, 'Solid stroke should be hidden under the dots.');
        assertEqual(guide.get('icons').length, 1, 'Dot icons should be applied.');
        t.manager.setDrawingMode(null);
        cleanupMap(map);
    });

    TestRunner.test('Finished circles/rectangles/polygons get a running zIndex 0, 1, 2... like Google', async function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.775, -122.42));
        t.manager.setDrawingMode('marker');
        await clickMap(map, [ll(37.76, -122.43)]);
        t.manager.setDrawingMode('rectangle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.78, -122.41));
        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42), ll(37.78, -122.41)]);
        clickFinishingNode(t.manager);
        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.74, -122.42), ll(37.745, -122.42));

        var shapes = t.events.filter(function (e) { return e.type !== 'marker'; });
        assertEqual(shapes.length, 4, 'Four vector shapes should be emitted.');
        shapes.forEach(function (e, i)
        {
            assertEqual(e.overlay.get('zIndex'), i, e.type + ' ' + i + ' zIndex.');
        });
        assertEqual(t.events[1].overlay.get('zIndex'), undefined, 'Markers are not numbered.');
        cleanupMap(map);
    });

    TestRunner.test('A caller zIndex is kept and does not use up a number', function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, { circleOptions: { zIndex: 1000 } });

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.775, -122.42));
        t.manager.setDrawingMode('rectangle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.78, -122.41));

        assertEqual(t.events[0].overlay.get('zIndex'), 1000, 'Caller zIndex should be kept.');
        assertEqual(t.events[1].overlay.get('zIndex'), 0, 'Counter should not have advanced for the caller zIndex.');
        cleanupMap(map);
    });

    TestRunner.test('Unset stroke/fill options are left to Google defaults; set ones pass through', function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, {
            circleOptions: { strokeColor: '#ff0000', fillColor: '#00ff00', fillOpacity: 0.15 }
        });

        drawCircleAndRectangle(t, map).forEach(function (o, i)
        {
            var type = t.events[i].type;
            assertEqual(o.get('strokeWeight'), undefined, type + ' strokeWeight should be Google default (unset).');
            assertEqual(o.get('strokeOpacity'), undefined, type + ' strokeOpacity should be Google default (unset).');
        });
        var circle = t.events[0].overlay;
        assertEqual(circle.get('strokeColor'), '#ff0000', 'strokeColor passes through.');
        assertEqual(circle.get('fillColor'), '#00ff00', 'fillColor passes through.');
        assertEqual(circle.get('fillOpacity'), 0.15, 'fillOpacity passes through.');
        assertEqual(t.events[1].overlay.get('strokeColor'), undefined, 'Rectangle strokeColor should be Google default (unset).');
        cleanupMap(map);
    });

    TestRunner.test('clickable: false is kept on finished shapes after drawing ends', async function ()
    {
        var map = createRealMap();
        var noClick = { clickable: false };
        var t = managerWithOptions(map, { circleOptions: noClick, rectangleOptions: noClick, polygonOptions: noClick });

        drawCircleAndRectangle(t, map);
        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42), ll(37.78, -122.41)]);
        clickFinishingNode(t.manager);

        assertEqual(t.events.length, 3, 'Three shapes should be emitted.');
        t.events.forEach(function (e)
        {
            assertTrue(e.overlay.get('clickable') === false, e.type + ' should stay non-clickable once drawing ends');
        });
        cleanupMap(map);
    });

    TestRunner.test('Shapes are not clickable while a drawing tool is active', function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, {});

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.77, -122.42), ll(37.775, -122.42));
        var circle = t.events[0].overlay;
        assertTrue(circle.get('clickable') === true, 'Circle should be clickable in pan mode');

        t.manager.setDrawingMode('polygon');
        assertTrue(circle.get('clickable') === false, 'Existing shapes should not be clickable while drawing');

        t.manager.setDrawingMode(null);
        assertTrue(circle.get('clickable') === true, 'Existing shapes should be clickable again after drawing');
        cleanupMap(map);
    });

    TestRunner.test('polygonOptions styling and editable are applied to the finished polygon', async function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, {
            polygonOptions: { editable: true, draggable: true, strokeColor: '#ff0000', fillColor: '#00ff00', zIndex: 1000 }
        });

        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42), ll(37.78, -122.41)]);
        clickFinishingNode(t.manager);

        var polygon = assertSingleOverlay(t.events, 'polygon', google.maps.Polygon);
        assertTrue(polygon.getEditable(), 'Polygon should be editable');
        assertTrue(polygon.getDraggable(), 'Polygon should be draggable');
        assertEqual(polygon.get('strokeColor'), '#ff0000', 'strokeColor.');
        assertEqual(polygon.get('fillColor'), '#00ff00', 'fillColor.');
        assertEqual(polygon.get('zIndex'), 1000, 'zIndex.');
        cleanupMap(map);
    });

    TestRunner.test('circleOptions styling with editable/draggable false is applied to the finished circle', function ()
    {
        var map = createRealMap();
        var t = managerWithOptions(map, {
            circleOptions: {
                editable: false, draggable: false, strokeColor: '#ff0000', strokeWeight: 3,
                fillColor: '#00ff00', fillOpacity: 0.4, zIndex: 1000
            }
        });

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.81, -122.42), ll(37.815, -122.42));

        var circle = assertSingleOverlay(t.events, 'circle', google.maps.Circle);
        assertFalse(circle.getEditable(), 'Circle should not be editable');
        assertFalse(circle.getDraggable(), 'Circle should not be draggable');
        assertEqual(circle.get('strokeColor'), '#ff0000', 'strokeColor.');
        assertEqual(circle.get('strokeWeight'), 3, 'strokeWeight.');
        assertEqual(circle.get('fillColor'), '#00ff00', 'fillColor.');
        assertEqual(circle.get('fillOpacity'), 0.4, 'fillOpacity.');
        assertEqual(circle.get('zIndex'), 1000, 'zIndex.');
        showOnLiveMap([circle]);
        cleanupMap(map);
    });

    TestRunner.test('A click without dragging does not emit a circle', function ()
    {
        var map = createRealMap();
        var t = newManager(map);
        var p = ll(37.77, -122.42);

        t.manager.setDrawingMode('circle');
        dragOnMap(map, p, p);

        assertEqual(t.events.length, 0, 'A zero-size circle should be discarded.');
        assertEqual(t.manager.getDrawingMode(), 'circle', 'Tool should stay active so the user can retry.');
        cleanupMap(map);
    });

    // Test 12: Mode Transitions
    TestRunner.test('Drawing mode can be changed between different modes', function ()
    {
        var map = createRealMap();
        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        // Test mode transitions
        manager.setDrawingMode('marker');
        assertEqual(manager.getDrawingMode(), 'marker');

        manager.setDrawingMode('polyline');
        assertEqual(manager.getDrawingMode(), 'polyline');

        manager.setDrawingMode('polygon');
        assertEqual(manager.getDrawingMode(), 'polygon');

        manager.setDrawingMode('circle');
        assertEqual(manager.getDrawingMode(), 'circle');

        manager.setDrawingMode('rectangle');
        assertEqual(manager.getDrawingMode(), 'rectangle');

        manager.setDrawingMode(null);
        assertEqual(manager.getDrawingMode(), null, 'Drawing mode should be null (pan)');
    });

    // Test 13: Settings Preservation - Undefined initial state
    TestRunner.test('Map with no gesture options is restored to Maps defaults', function ()
    {
        var map = createRealMap();   // no gestureHandling / disableDoubleClickZoom given
        var original = readSettings(map);

        var manager = new google.maps.drawing.DrawingManager({
            map: map,
            drawingControl: false
        });

        manager.setDrawingMode('marker');
        assertTrue(readSettings(map).disableDoubleClickZoom === true, 'disableDoubleClickZoom should be true while drawing');

        manager.setDrawingMode(null);
        var restored = readSettings(map);
        assertEqual(restored.gestureHandling, original.gestureHandling, 'gestureHandling is never touched by a marker tool');
        assertFalse(restored.disableDoubleClickZoom, 'disableDoubleClickZoom should return to the default (false)');
    });

    TestRunner.test('Several shapes drawn in a row are each emitted with the right type', async function ()
    {
        var map = createRealMap();
        var t = newManager(map);

        t.manager.setDrawingMode('polygon');
        await clickMap(map, [ll(37.77, -122.42), ll(37.78, -122.42), ll(37.78, -122.41)]);
        clickFinishingNode(t.manager);

        t.manager.setDrawingMode('circle');
        dragOnMap(map, ll(37.76, -122.43), ll(37.765, -122.43));

        t.manager.setDrawingMode('rectangle');
        dragOnMap(map, ll(37.74, -122.45), ll(37.75, -122.44));

        assertEqual(t.events.length, 3, 'All 3 shapes should be emitted.');
        assertEqual(t.events[0].type, 'polygon', 'First shape type.');
        assertEqual(t.events[1].type, 'circle', 'Second shape type.');
        assertEqual(t.events[2].type, 'rectangle', 'Third shape type.');
        assertTrue(t.events[0].overlay instanceof google.maps.Polygon, 'First overlay should be a Polygon');
        assertTrue(t.events[1].overlay instanceof google.maps.Circle, 'Second overlay should be a Circle');
        assertTrue(t.events[2].overlay instanceof google.maps.Rectangle, 'Third overlay should be a Rectangle');
        assertEqual(t.manager.getCompletedOverlays().length, 3, 'Manager should track all 3 overlays.');
        showOnLiveMap(t.events.map(function (e) { return e.overlay; }));
        cleanupMap(map);
    });

    TestRunner.test('No console errors during polyfill operations', function ()
    {
        var consoleErrors = [];
        var originalError = console.error;

        console.error = function() {
            consoleErrors.push(Array.prototype.slice.call(arguments).join(' '));
            originalError.apply(console, arguments);
        };

        try {
            var map = createRealMap({}, true);
            var manager = new google.maps.drawing.DrawingManager({
                map: map,
                drawingControl: false
            });

            var modes = ['polygon', 'circle', 'rectangle', 'marker', 'polyline'];
            for (var i = 0; i < modes.length; i++)
            {
                manager.setDrawingMode(modes[i]);
                manager.setDrawingMode(null);
            }

            // Detach mid-draw and re-attach
            manager.setDrawingMode('circle');
            manager.setMap(null);
            manager.setMap(map);
            manager.setDrawingMode(null);
        } finally {
            console.error = originalError;
        }

        assertTrue(consoleErrors.length === 0, 'No console errors should occur during operations');
    });

    // Export test runner for external use
    window.MCXDrawingTestRunner = TestRunner;

})();
